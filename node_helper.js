/**
 * Node Helper for MMM-Facial-Recognition
 * Reads face recognition status and communicates with the frontend module.
 */

const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");

module.exports = NodeHelper.create({
    // Module path - resolved dynamically
    modulePath: null,
    statusFile: null,
    
    // State tracking
    lastStatus: null,
    lastModified: 0,
    checkInterval: null,
    
    start: function() {
        console.log("[MMM-Facial-Recognition] Node helper starting...");
        
        // Resolve paths
        this.modulePath = path.resolve(__dirname);
        this.statusFile = path.join(this.modulePath, "status.json");
        
        console.log("[MMM-Facial-Recognition] Module path:", this.modulePath);
        console.log("[MMM-Facial-Recognition] Status file:", this.statusFile);
        
        // Ensure status file exists with default values
        this.initializeStatusFile();
    },
    
    stop: function() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        console.log("[MMM-Facial-Recognition] Node helper stopped.");
    },
    
    initializeStatusFile: function() {
        if (!fs.existsSync(this.statusFile)) {
            const defaultStatus = {
                user: null,
                isKnown: false,
                sleeping: false,  // Start awake, let Python script manage sleep
                timestamp: Date.now() / 1000
            };
            
            try {
                fs.writeFileSync(this.statusFile, JSON.stringify(defaultStatus, null, 2));
                console.log("[MMM-Facial-Recognition] Created default status file.");
            } catch (err) {
                console.error("[MMM-Facial-Recognition] Failed to create status file:", err);
            }
        }
    },
    
    getKnownProfiles: function() {
        /**
         * Scan the public directory for profile images.
         * Returns array of profile names from files matching *-id.png
         */
        const publicPath = path.join(this.modulePath, "public");
        const profiles = [];
        
        try {
            const files = fs.readdirSync(publicPath);
            files.forEach(file => {
                if (file.endsWith("-id.png")) {
                    const profileName = file.replace("-id.png", "");
                    profiles.push({
                        name: profileName,
                        image: `modules/MMM-Facial-Recognition/public/${file}`
                    });
                }
            });
        } catch (err) {
            console.error("[MMM-Facial-Recognition] Error reading profiles:", err);
        }
        
        return profiles;
    },
    
    readStatus: function() {
        /**
         * Read and parse the status JSON file written by Python.
         */
        try {
            // Check if file exists and has been modified
            if (!fs.existsSync(this.statusFile)) {
                return null;
            }
            
            const stats = fs.statSync(this.statusFile);
            const modified = stats.mtimeMs;
            
            // Only parse if file was modified
            if (modified === this.lastModified && this.lastStatus) {
                return this.lastStatus;
            }
            
            const content = fs.readFileSync(this.statusFile, "utf8");
            const status = JSON.parse(content);
            
            this.lastModified = modified;
            this.lastStatus = status;
            
            return status;
            
        } catch (err) {
            // Don't spam console with errors if file is being written
            if (err.code !== "ENOENT") {
                console.error("[MMM-Facial-Recognition] Error reading status:", err.message);
            }
            return this.lastStatus;
        }
    },
    
    socketNotificationReceived: function(notification, payload) {
        switch (notification) {
            case "START_RECOGNITION":
                this.startPolling(payload.interval || 1000);
                break;
                
            case "STOP_RECOGNITION":
                this.stopPolling();
                break;
                
            case "GET_PROFILES":
                const profiles = this.getKnownProfiles();
                this.sendSocketNotification("PROFILES_LIST", profiles);
                break;
                
            case "CHECK_STATUS":
                this.checkAndSendStatus();
                break;
        }
    },
    
    startPolling: function(interval) {
        // Clear existing interval if any
        this.stopPolling();
        
        console.log(`[MMM-Facial-Recognition] Starting status polling (${interval}ms)`);
        
        // Initial check
        this.checkAndSendStatus();
        
        // Set up polling
        this.checkInterval = setInterval(() => {
            this.checkAndSendStatus();
        }, interval);
    },
    
    stopPolling: function() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log("[MMM-Facial-Recognition] Stopped status polling");
        }
    },
    
    checkAndSendStatus: function() {
        const status = this.readStatus();
        
        if (!status) {
            this.sendSocketNotification("RECOGNITION_STATUS", {
                user: null,
                isKnown: false,
                sleeping: false,
                noData: true,
                timeSinceFace: null,
                profileCount: 0,
                sleepTimeoutSecs: 300
            });
            return;
        }
        
        // Get profile image if user is known
        let userImage = "modules/MMM-Facial-Recognition/public/guest.gif";
        
        if (status.isKnown && status.user) {
            const profileImage = path.join(this.modulePath, "public", `${status.user}-id.png`);
            if (fs.existsSync(profileImage)) {
                userImage = `modules/MMM-Facial-Recognition/public/${status.user}-id.png`;
            }
        }
        
        // Pass through all status info including debug data
        this.sendSocketNotification("RECOGNITION_STATUS", {
            user: status.user,
            isKnown: status.isKnown,
            sleeping: status.sleeping,
            timestamp: status.timestamp,
            userImage: userImage,
            // Debug info from Python
            timeSinceFace: status.timeSinceFace,
            profileCount: status.profileCount || 0,
            profileNames: status.profileNames || [],
            sleepTimeoutSecs: status.sleepTimeoutSecs || 300,
            cameraType: status.cameraType || "unknown"
        });
    }
});
