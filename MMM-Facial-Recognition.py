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
    try:
        import picamera
        camera = picamera.PiCamera()
        camera.resolution = CAMERA_RESOLUTION
        print("[SUCCESS] PiCamera initialized")
        return camera, "picamera"
    except ImportError:
        print("[INFO] PiCamera not available, trying OpenCV...")
    except Exception as e:
        print(f"[WARNING] PiCamera failed: {e}, trying OpenCV...")
    
    # Fallback to OpenCV for non-RPi systems
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
    if camera_type == "picamera":
        output = np.empty((CAMERA_RESOLUTION[1], CAMERA_RESOLUTION[0], 3), dtype=np.uint8)
        camera.capture(output, format="rgb")
        return output
    elif camera_type == "opencv":
        import cv2
        ret, frame = camera.read()
        if ret:
            # Convert BGR to RGB
            return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
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
    
    print("\n[INFO] Starting facial recognition loop...")
    print(f"[INFO] Sleep timeout: {SLEEP_TIMEOUT} seconds")
    print("-" * 50)
    
    # Write initial "awake" status so MagicMirror shows guest mode immediately
    write_status(STATUS_FILE, {
        "user": "Guest",
        "isKnown": False,
        "sleeping": False,
        "timestamp": time.time()
    })
    
    try:
        while True:
            current_time = time.time()
            
            # Capture frame
            frame = capture_frame(camera, camera_type)
            
            # Recognize face
            recognized_name, face_detected = recognize_face(frame, known_faces)
            
            if face_detected:
                last_face_seen = current_time
                
                # Wake up if sleeping
                if is_sleeping:
                    is_sleeping = False
                    print("[INFO] Face detected - waking up display")
                
                # Update user if changed or enough time has passed
                if (recognized_name != current_user or 
                    current_time - last_recognition_time > RECOGNITION_HOLD_TIME):
                    current_user = recognized_name
                    last_recognition_time = current_time
                    
                    is_known = recognized_name != "Guest"
                    print(f"[RECOGNIZED] {recognized_name} ({'known' if is_known else 'guest'})")
                    
                    write_status(STATUS_FILE, {
                        "user": recognized_name,
                        "isKnown": is_known,
                        "sleeping": False,
                        "timestamp": current_time
                    })
            
            else:
                # No face detected - check for sleep timeout
                time_since_face = current_time - last_face_seen
                
                if time_since_face >= SLEEP_TIMEOUT and not is_sleeping:
                    is_sleeping = True
                    current_user = None
                    print(f"[SLEEP] No face for {SLEEP_TIMEOUT}s - entering sleep mode")
                    
                    write_status(STATUS_FILE, {
                        "user": None,
                        "isKnown": False,
                        "sleeping": True,
                        "timestamp": current_time
                    })
            
            # Wait before next capture
            time.sleep(FACE_DETECTION_INTERVAL)
    
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down...")
    finally:
        # Cleanup
        if camera_type == "picamera":
            camera.close()
        elif camera_type == "opencv":
            camera.release()
        print("[INFO] Camera released. Goodbye!")


if __name__ == "__main__":
    main()
