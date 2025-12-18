#!/usr/bin/env python3
"""
Facial Recognition Module for MagicMirror²
Supports multiple profiles with guest fallback and sleep mode after inactivity.
"""

import face_recognition
import numpy as np
import sys
import os
import time
import json
from pathlib import Path

# Configuration
MODULE_PATH = os.path.expanduser("~/MagicMirror/modules/MMM-Facial-Recognition")
PUBLIC_PATH = os.path.join(MODULE_PATH, "public")
STATUS_FILE = os.path.join(MODULE_PATH, "status.json")
CAMERA_RESOLUTION = (320, 240)
FACE_DETECTION_INTERVAL = 1.0  # seconds between captures
SLEEP_TIMEOUT = 300  # 5 minutes in seconds
FACE_TOLERANCE = 0.6  # Lower = stricter matching (0.6 is default)
RECOGNITION_HOLD_TIME = 15  # seconds to keep user logged in
WAKE_CONFIRMATION_TIME = 5  # seconds to keep sending wake signals after waking


def load_known_faces(public_path):
    """
    Load all face profiles from the public directory.
    Files should be named: ProfileName-id.png (e.g., Tony-id.png, Sarah-id.png)
    """
    known_faces = {}
    
    if not os.path.exists(public_path):
        print(f"[ERROR] Public path does not exist: {public_path}")
        return known_faces
    
    for filename in os.listdir(public_path):
        if filename.endswith("-id.png"):
            profile_name = filename.replace("-id.png", "")
            image_path = os.path.join(public_path, filename)
            
            try:
                print(f"[INFO] Loading profile: {profile_name}")
                image = face_recognition.load_image_file(image_path)
                encodings = face_recognition.face_encodings(image)
                
                if encodings:
                    known_faces[profile_name] = encodings[0]
                    print(f"[SUCCESS] Loaded face encoding for: {profile_name}")
                else:
                    print(f"[WARNING] No face found in image: {filename}")
            except Exception as e:
                print(f"[ERROR] Failed to load {filename}: {e}")
    
    return known_faces


def write_status(status_file, data):
    """Write current status to JSON file for node_helper to read."""
    try:
        with open(status_file, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        print(f"[ERROR] Failed to write status: {e}")


def initialize_camera():
    """Initialize the Raspberry Pi camera."""
    # Try picamera2 first (for newer Raspberry Pi OS Bookworm+)
    try:
        from picamera2 import Picamera2
        camera = Picamera2()
        config = camera.create_still_configuration(main={"size": CAMERA_RESOLUTION})
        camera.configure(config)
        camera.start()
        print("[SUCCESS] PiCamera2 initialized")
        return camera, "picamera2"
    except ImportError:
        print("[INFO] PiCamera2 not available, trying legacy PiCamera...")
    except Exception as e:
        print(f"[WARNING] PiCamera2 failed: {e}, trying legacy PiCamera...")
    
    # Try legacy picamera (for older Raspberry Pi OS)
    try:
        import picamera
        camera = picamera.PiCamera()
        camera.resolution = CAMERA_RESOLUTION
        print("[SUCCESS] Legacy PiCamera initialized")
        return camera, "picamera"
    except ImportError:
        print("[INFO] Legacy PiCamera not available, trying OpenCV...")
    except Exception as e:
        print(f"[WARNING] Legacy PiCamera failed: {e}, trying OpenCV...")
    
    # Fallback to OpenCV for USB cameras or non-RPi systems
    try:
        import cv2
        camera = cv2.VideoCapture(0)
        if camera.isOpened():
            camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_RESOLUTION[0])
            camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_RESOLUTION[1])
            print("[SUCCESS] OpenCV camera initialized")
            return camera, "opencv"
        else:
            raise Exception("Could not open camera")
    except Exception as e:
        print(f"[ERROR] OpenCV camera failed: {e}")
        return None, None


def capture_frame(camera, camera_type):
    """Capture a single frame from the camera."""
    try:
        if camera_type == "picamera2":
            # Picamera2 returns RGB by default
            frame = camera.capture_array()
            return frame
        elif camera_type == "picamera":
            output = np.empty((CAMERA_RESOLUTION[1], CAMERA_RESOLUTION[0], 3), dtype=np.uint8)
            camera.capture(output, format="rgb")
            return output
        elif camera_type == "opencv":
            import cv2
            ret, frame = camera.read()
            if ret:
                # Convert BGR to RGB
                return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    except Exception as e:
        print(f"[ERROR] Frame capture failed: {e}")
    return None


def recognize_face(frame, known_faces):
    """
    Attempt to recognize faces in the frame.
    Returns tuple: (recognized_name, is_known_user)
    """
    if frame is None:
        return "Guest", False
    
    # Find all faces in the frame
    face_locations = face_recognition.face_locations(frame, model="hog")
    
    if not face_locations:
        return None, False  # No face detected
    
    face_encodings = face_recognition.face_encodings(frame, face_locations)
    
    for face_encoding in face_encodings:
        # Check against all known faces
        for name, known_encoding in known_faces.items():
            matches = face_recognition.compare_faces(
                [known_encoding], 
                face_encoding, 
                tolerance=FACE_TOLERANCE
            )
            if matches[0]:
                return name, True
    
    # Face detected but not recognized
    return "Guest", True


def main():
    print("=" * 50)
    print("MagicMirror² Facial Recognition Module")
    print("=" * 50)
    
    # Initialize camera
    camera, camera_type = initialize_camera()
    if camera is None:
        print("[FATAL] No camera available. Exiting.")
        sys.exit(1)
    
    # Load known faces
    print(f"\n[INFO] Loading face profiles from: {PUBLIC_PATH}")
    known_faces = load_known_faces(PUBLIC_PATH)
    print(f"[INFO] Loaded {len(known_faces)} profile(s): {list(known_faces.keys())}")
    
    if not known_faces:
        print("[WARNING] No profiles loaded! Only Guest mode will work.")
    
    # State tracking
    last_face_seen = time.time()
    current_user = None
    is_sleeping = False
    last_recognition_time = 0
    last_wake_time = 0  # Track when we last woke up to ensure wake signals are sent
    
    print("\n[INFO] Starting facial recognition loop...")
    print(f"[INFO] Sleep timeout: {SLEEP_TIMEOUT} seconds")
    print("-" * 50)
    
    # Helper to build status with debug info
    def build_status(user, is_known, sleeping, time_since_face):
        return {
            "user": user,
            "isKnown": is_known,
            "sleeping": sleeping,
            "timestamp": time.time(),
            # Debug info
            "timeSinceFace": time_since_face,
            "profileCount": len(known_faces),
            "profileNames": list(known_faces.keys()),
            "sleepTimeoutSecs": SLEEP_TIMEOUT,
            "cameraType": camera_type
        }
    
    # Write initial "awake" status so MagicMirror shows guest mode immediately
    write_status(STATUS_FILE, build_status("Guest", False, False, 0))
    
    try:
        while True:
            current_time = time.time()
            time_since_face = current_time - last_face_seen
            
            # Capture frame
            frame = capture_frame(camera, camera_type)
            
            # Recognize face
            recognized_name, face_detected = recognize_face(frame, known_faces)
            
            if face_detected:
                last_face_seen = current_time
                time_since_face = 0
                
                # Wake up if sleeping - always write status immediately
                if is_sleeping:
                    is_sleeping = False
                    current_user = recognized_name
                    last_recognition_time = current_time
                    last_wake_time = current_time  # Track wake time
                    is_known = recognized_name != "Guest"
                    print(f"[WAKE] Face detected - waking up! User: {recognized_name}")
                    
                    write_status(STATUS_FILE, build_status(
                        recognized_name, is_known, False, time_since_face
                    ))
                
                # During wake confirmation period, always write status to ensure
                # the frontend receives the wake signal (prevents stuck overlay)
                elif current_time - last_wake_time < WAKE_CONFIRMATION_TIME:
                    # Update current_user if it changed to maintain consistency
                    if recognized_name != current_user:
                        current_user = recognized_name
                        last_recognition_time = current_time
                    is_known = recognized_name != "Guest"
                    write_status(STATUS_FILE, build_status(
                        recognized_name, is_known, False, time_since_face
                    ))
                
                # Update user if changed or enough time has passed (normal operation)
                elif (recognized_name != current_user or 
                    current_time - last_recognition_time > RECOGNITION_HOLD_TIME):
                    current_user = recognized_name
                    last_recognition_time = current_time
                    
                    is_known = recognized_name != "Guest"
                    print(f"[RECOGNIZED] {recognized_name} ({'known' if is_known else 'guest'})")
                    
                    write_status(STATUS_FILE, build_status(
                        recognized_name, is_known, False, time_since_face
                    ))
            
            else:
                # No face detected - check for sleep timeout
                if time_since_face >= SLEEP_TIMEOUT and not is_sleeping:
                    is_sleeping = True
                    current_user = None
                    print(f"[SLEEP] No face for {SLEEP_TIMEOUT}s - entering sleep mode")
                
                # Always update status so debug panel shows current time_since_face
                if is_sleeping:
                    write_status(STATUS_FILE, build_status(
                        None, False, True, time_since_face
                    ))
                else:
                    # Still awake but no face - update time since face
                    write_status(STATUS_FILE, build_status(
                        current_user or "Guest", 
                        current_user is not None and current_user != "Guest",
                        False, 
                        time_since_face
                    ))
            
            # Wait before next capture
            time.sleep(FACE_DETECTION_INTERVAL)
    
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down...")
    finally:
        # Cleanup
        if camera_type == "picamera2":
            camera.stop()
            camera.close()
        elif camera_type == "picamera":
            camera.close()
        elif camera_type == "opencv":
            camera.release()
        print("[INFO] Camera released. Goodbye!")


if __name__ == "__main__":
    main()
