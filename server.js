const WebSocket = require('ws');
const { spawn } = require('child_process');

const wss = new WebSocket.Server({ port: 8080 });
let activeClient = null;

wss.on('connection', (ws) => {
    if (activeClient) {
        // Reject additional connections
        ws.close(1000, 'Only one client can connect at a time.');
        console.log('Connection rejected: Only one client is allowed.');
        return;
    }

    console.log('Client connected');
    activeClient = ws;
    let totalBytesTransferred = 0;

    // Spawn FFmpeg process to handle the video stream
    const ffmpeg = spawn("ffmpeg", [
        "-i", "pipe:0",                // Input from stdin (WebSocket data)

        // Video encoding
        "-c:v", "libx264",             // Encode video with H.264 codec
        "-preset", "veryfast",         // Use the very fast preset for faster encoding with balanced quality
        "-tune", "zerolatency",        // Tune for real-time, low-latency streaming
        "-pix_fmt", "yuv420p",         // Set pixel format to yuv420p for compatibility

        // Bitrate settings
        "-b:v", "1000k",               // Set video bitrate to 1000 Kbps
        "-maxrate", "1000k",           // Maximum video bitrate (caps the bitrate to 1000 Kbps)
        "-bufsize", "2000k",           // Buffer size for smoother streaming

        // Keyframe and GOP settings
        "-g", "60",                    // Set GOP (keyframe interval) to 60 frames (2 seconds at 30fps)
        "-keyint_min", "60",           // Minimum interval between keyframes (force keyframe every 60 frames)
        "-sc_threshold", "0",          // Disable scene change detection for keyframe insertion

        // Audio encoding
        "-c:a", "aac",                 // Use AAC codec for audio
        "-b:a", "128k",                // Set audio bitrate to 128 Kbps

        // Output format and RTMP stream
        "-f", "flv",                   // Output format FLV (for RTMP streaming)
        "rtmp://localhost:1935/live/stream"  // RTMP URL for NGINX RTMP server
    ]);

    ws.on('message', (data) => {
        totalBytesTransferred += data.length;
        const mbTransferred = (totalBytesTransferred / 1048576).toFixed(2);
        console.log(`Data transferred: ${mbTransferred} MB`);
        ffmpeg.stdin.write(data);  // Send WebSocket data to FFmpeg
    });

    ws.on('close', () => {
        const totalMBTransferred = (totalBytesTransferred / 1048576).toFixed(2);  // Convert to MB
        console.log('Client disconnected');
        ffmpeg.stdin.end();  // End FFmpeg process on WebSocket disconnect
        console.log(`Total data transferred during the session: ${totalMBTransferred} MB`);
        activeClient = null;
    });

    ws.on('error', (error) => {
        console.error('WebSocket error: ', error);
        ffmpeg.stdin.end();  // Handle errors and close FFmpeg
        activeClient = null;
    });
});
