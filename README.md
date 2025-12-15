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

```bash
pip3 install face_recognition numpy
# For Raspberry Pi Camera:
pip3 install picamera
# For USB webcam (optional fallback):
pip3 install opencv-python
```

### Step 3: Add to MagicMirror Config

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

### Step 4: Add Face Profiles

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

### Step 5: Start the Recognition Script

Run the Python script (recommend using a service or autostart):

```bash
python3 ~/MagicMirror/modules/MMM-Facial-Recognition/MMM-Facial-Recognition.py
```

#### Autostart with systemd (Recommended)

Create a service file:

```bash
sudo nano /etc/systemd/system/facial-recognition.service
```

Add:

```ini
[Unit]
Description=MagicMirror Facial Recognition
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/MagicMirror/modules/MMM-Facial-Recognition
ExecStart=/usr/bin/python3 /home/pi/MagicMirror/modules/MMM-Facial-Recognition/MMM-Facial-Recognition.py
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

## Python Script Configuration

Edit the constants at the top of `MMM-Facial-Recognition.py`:

```python
SLEEP_TIMEOUT = 300           # 5 minutes until sleep mode
FACE_TOLERANCE = 0.6          # Lower = stricter matching
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

### Camera not detected
- Ensure camera is enabled: `sudo raspi-config` → Interface Options → Camera
- For USB cameras, check with: `ls /dev/video*`

### No faces recognized
- Check profile image quality (clear, front-facing, well-lit)
- Try adjusting `FACE_TOLERANCE` (lower = stricter, higher = more lenient)
- Verify profile images have proper naming: `Name-id.png`

### Module not updating
- Check Python script is running: `systemctl status facial-recognition`
- View logs: `journalctl -u facial-recognition -f`
- Verify `status.json` is being updated

### High CPU usage
- Increase `FACE_DETECTION_INTERVAL` in Python script
- Increase `pollInterval` in module config
- Use lower camera resolution

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues.

## License

MIT License - See [LICENSE](LICENSE) for details.

## Credits

- [face_recognition](https://github.com/ageitgey/face_recognition) by Adam Geitgey
- [MagicMirror²](https://github.com/MichMich/MagicMirror) by Michael Teeuw
