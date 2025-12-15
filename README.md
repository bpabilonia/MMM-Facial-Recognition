# MMM-Facial-Recognition

A facial recognition module for [MagicMirror²](https://github.com/MichMich/MagicMirror) with multi-profile support, guest fallback, and automatic sleep mode.

## Features

- 🎭 **Multi-Profile Support** - Register unlimited face profiles
- 👤 **Guest Mode** - Automatic fallback for unrecognized faces
- 😴 **Sleep Mode** - Display dims after 5 minutes of inactivity
- 🔄 **Real-time Recognition** - Continuous face detection and matching
- ✨ **Animated UI** - Smooth transitions and visual feedback

## Screenshots

| ![FaceID Guest](img/readme/facial-recognition-guest.png) | ![Face ID Detected](img/readme/facial-recognition-stark.png) |
|---|---|
| Guest profile (unrecognized) | User recognized |

## Prerequisites

- MagicMirror² instance
- Node.js >= 14
- Python 3.7+
- [face_recognition](https://github.com/ageitgey/face_recognition) library
- Camera (Raspberry Pi Camera or USB webcam)

## Installation

### Step 1: Clone the Module

```bash
cd ~/MagicMirror/modules
git clone https://github.com/bpabilonia/MMM-Facial-Recognition.git
cd MMM-Facial-Recognition
npm install
```

### Step 2: Install Python Dependencies

Create a virtual environment with system site packages (required for picamera2):

```bash
cd ~/MagicMirror/modules/MMM-Facial-Recognition

# Create virtual environment WITH system packages (important for camera access)
python3 -m venv --system-site-packages venv

# Activate it
source venv/bin/activate

# Install dependencies
pip install face_recognition numpy

# For USB webcam (optional fallback):
pip install opencv-python
```

> **Important:** The `--system-site-packages` flag is required so the virtual environment can access the system's `libcamera` and `picamera2` modules which are pre-installed on Raspberry Pi OS.

### Step 3: Enable the Camera (Raspberry Pi)

#### On Raspberry Pi OS Bookworm (newer):

The camera option has been removed from raspi-config. Enable manually:

```bash
sudo nano /boot/firmware/config.txt
```

Add at the bottom:
```
camera_auto_detect=1
start_x=1
gpu_mem=128
```

Save and reboot:
```bash
sudo reboot
```

#### On Raspberry Pi OS Bullseye (older):

```bash
sudo raspi-config
# Navigate to: Interface Options → Camera → Enable
sudo reboot
```

### Step 4: Verify Camera is Working

```bash
# Check camera status
vcgencmd get_camera
# Should show: supported=1 detected=1

# Test with Python
cd ~/MagicMirror/modules/MMM-Facial-Recognition
source venv/bin/activate

python3 -c "
from picamera2 import Picamera2
cam = Picamera2()
cam.start()
import time
time.sleep(2)
frame = cam.capture_array()
print(f'SUCCESS! Camera working. Frame: {frame.shape}')
cam.stop()
cam.close()
"
```

### Step 5: Add to MagicMirror Config

Add to your `config/config.js`:

```javascript
{
    module: "MMM-Facial-Recognition",
    position: "top_right",
    config: {
        prompt: "Face ID Active",
        guestPrompt: "Welcome, Guest",
        sleepPrompt: "Show your face to wake up",
        width: "200px",
        position: "center",
        pollInterval: 1000,
        animationSpeed: 1000,
        showUserImage: true,
        dimOnSleep: true,
        sleepDimLevel: 0.1
    }
}
```

### Step 6: Add Face Profiles

Place profile images in the `public/` folder with the naming convention:

```
ProfileName-id.png
```

Examples:
- `Tony-id.png`
- `Sarah-id.png`
- `Mom-id.png`

**Tips for best recognition:**
- Use clear, front-facing photos
- Good lighting, no shadows on face
- One face per image
- Minimum 200x200 pixels recommended
- Similar conditions to how the camera will see you

#### Take a Profile Photo with the Pi Camera:

```bash
cd ~/MagicMirror/modules/MMM-Facial-Recognition
source venv/bin/activate

python3 -c "
from picamera2 import Picamera2
import time
cam = Picamera2()
cam.start()
time.sleep(2)
print('Taking photo in 3 seconds... Look at the camera!')
time.sleep(3)
cam.capture_file('public/YourName-id.png')
print('Photo saved to public/YourName-id.png')
cam.stop()
cam.close()
"
```

### Step 7: Start the Recognition Script

Run the Python script (recommend using a service or autostart):

```bash
# Activate virtual environment first
source ~/MagicMirror/modules/MMM-Facial-Recognition/venv/bin/activate

# Run the script
python3 ~/MagicMirror/modules/MMM-Facial-Recognition/MMM-Facial-Recognition.py
```

You should see output like:
```
==================================================
MagicMirror² Facial Recognition Module
==================================================
[SUCCESS] PiCamera2 initialized
[INFO] Loaded 1 profile(s): ['Tony']
[INFO] Starting facial recognition loop...
--------------------------------------------------
[RECOGNIZED] Guest (guest)
[RECOGNIZED] Tony (known)
```

#### Autostart with systemd (Recommended)

Create a service file:

```bash
sudo nano /etc/systemd/system/facial-recognition.service
```

Add (update username if not `pi`):

```ini
[Unit]
Description=MagicMirror Facial Recognition
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/MagicMirror/modules/MMM-Facial-Recognition
ExecStart=/home/pi/MagicMirror/modules/MMM-Facial-Recognition/venv/bin/python3 /home/pi/MagicMirror/modules/MMM-Facial-Recognition/MMM-Facial-Recognition.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable facial-recognition
sudo systemctl start facial-recognition
```

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `prompt` | Status text shown when active | `"Face ID Active"` |
| `guestPrompt` | Message for unrecognized faces | `"Welcome, Guest"` |
| `sleepPrompt` | Message during sleep mode | `"Show your face to wake up"` |
| `width` | Profile image width | `"200px"` |
| `position` | Alignment: left, center, right | `"center"` |
| `pollInterval` | Status check interval (ms) | `1000` |
| `animationSpeed` | Transition duration (ms) | `1000` |
| `showUserImage` | Display profile picture | `true` |
| `dimOnSleep` | Dim screen in sleep mode | `true` |
| `sleepDimLevel` | Sleep opacity (0-1) | `0.1` |
| `debug` | Show debug panel with status info | `false` |

## Debug Mode

Enable debug mode to see real-time status information on your mirror:

```javascript
{
    module: "MMM-Facial-Recognition",
    position: "top_right",
    config: {
        debug: true  // Shows debug panel
    }
}
```

The debug panel displays:
- **Python Script**: Whether the recognition script is running
- **Profiles Loaded**: Number of registered face profiles
- **Current State**: Sleeping / Guest / Recognized
- **Current User**: Name of recognized user
- **Last Face Seen**: Time since a face was detected
- **Sleep After**: Configured sleep timeout
- **Last Update**: Time since last status update

## Python Script Configuration

Edit the constants at the top of `MMM-Facial-Recognition.py`:

```python
SLEEP_TIMEOUT = 300           # 5 minutes until sleep mode
FACE_TOLERANCE = 0.6          # Lower = stricter matching (0.5-0.7 recommended)
RECOGNITION_HOLD_TIME = 15    # Seconds before re-checking
FACE_DETECTION_INTERVAL = 1.0 # Seconds between captures
```

## File Structure

```
MMM-Facial-Recognition/
├── css/
│   └── mmm-style.css          # Module styles
├── public/
│   ├── guest.gif              # Guest avatar
│   ├── face.png               # Default face (legacy)
│   └── *-id.png               # Profile images
├── MMM-Facial-Recognition.js  # Frontend module
├── MMM-Facial-Recognition.py  # Recognition script
├── node_helper.js             # Backend communication
├── status.json                # Recognition status (auto-generated)
└── README.md
```

## How It Works

1. **Python Script** continuously captures frames from the camera
2. Faces are detected and compared against registered profiles
3. Recognition status is written to `status.json`
4. **Node Helper** reads the status file and forwards to the frontend
5. **Frontend Module** updates the UI based on recognition state
6. If no face is detected for 5 minutes, sleep mode activates

## Troubleshooting

### Camera Not Detected

**Check camera status:**
```bash
vcgencmd get_camera
# Should show: supported=1 detected=1
```

**If `supported=0`:**
- Edit `/boot/firmware/config.txt` and add:
  ```
  camera_auto_detect=1
  start_x=1
  gpu_mem=128
  ```
- Reboot

**If `detected=0`:**
- Check ribbon cable connection (blue side toward Ethernet port)
- Try reseating the cable at both ends
- Power off completely, reseat cable, power on

**Verify I2C communication:**
```bash
sudo apt install -y i2c-tools
sudo i2cdetect -y 10
# Should show "UU" or "10" at address 10
```

### libcamera Module Not Found

If you see `ModuleNotFoundError: No module named 'libcamera'`:

```bash
# Recreate venv with system packages
cd ~/MagicMirror/modules/MMM-Facial-Recognition
deactivate
rm -rf venv
python3 -m venv --system-site-packages venv
source venv/bin/activate
pip install face_recognition numpy
```

### Face Detected but Not Recognized

If you see `[RECOGNIZED] Guest (guest)` when it should recognize you:

1. **Check lighting** - Face should be well-lit, not backlit
2. **Face the camera directly** - Look straight at the camera
3. **Adjust tolerance** - Edit `MMM-Facial-Recognition.py`:
   ```python
   FACE_TOLERANCE = 0.7  # Increase for more lenient matching
   ```
4. **Take a new profile photo** - Use the camera to capture your face in similar conditions

### Module Not Updating

```bash
# Check Python script is running
systemctl status facial-recognition

# View logs
journalctl -u facial-recognition -f

# Check status file is updating
watch -n 1 cat ~/MagicMirror/modules/MMM-Facial-Recognition/status.json
```

### High CPU Usage

- Increase `FACE_DETECTION_INTERVAL` in Python script (e.g., `2.0`)
- Increase `pollInterval` in module config (e.g., `2000`)

### Camera Works but No Video Devices

Install libcamera tools:
```bash
sudo apt update
sudo apt install -y libcamera-apps
```

## Testing the Camera

### Quick Camera Test

```bash
cd ~/MagicMirror/modules/MMM-Facial-Recognition
source venv/bin/activate

python3 -c "
from picamera2 import Picamera2
import face_recognition
import time

print('Starting camera...')
cam = Picamera2()
cam.start()
time.sleep(2)

print('Capturing frame...')
frame = cam.capture_array()
frame_rgb = frame[:, :, :3][:, :, ::-1]  # Convert to RGB

print('Looking for faces...')
faces = face_recognition.face_locations(frame_rgb)
print(f'Found {len(faces)} face(s)!')

cam.stop()
cam.close()
"
```

### Test Profile Matching

```bash
python3 MMM-Facial-Recognition.py
```

Stand in front of the camera. You should see:
- `[RECOGNIZED] Guest (guest)` - Face detected but not matched
- `[RECOGNIZED] Tony (known)` - Face matched to profile!

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## License

MIT License - See [LICENSE](LICENSE) for details.

## Credits

- [face_recognition](https://github.com/ageitgey/face_recognition) by Adam Geitgey
- [MagicMirror²](https://github.com/MichMich/MagicMirror) by Michael Teeuw
