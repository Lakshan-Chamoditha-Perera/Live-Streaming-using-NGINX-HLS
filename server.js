const WebSocket = require('ws');
const {spawn} = require('child_process');
const ffmpegStatic = require('ffmpeg-static');

// WebSocket server setup
const wss = new WebSocket.Server({port: 9000});
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
    const ffmpeg = spawn(ffmpegStatic, [
        "-i", "pipe:0",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-tune", "zerolatency",
        "-pix_fmt", "yuv420p",
        "-b:v", "1000k",
        "-maxrate", "1000k",
        "-bufsize", "2000k",
        "-g", "30",                        // Shorter GOP size for more frequent keyframes
        "-keyint_min", "30",
        "-sc_threshold", "0",
        "-c:a", "aac",
        "-b:a", "256k",
        "-profile:a", "aac_low",
        "-ar", "48000",
        "-ac", "2",
        "-f", "flv",
        "rtmp://192.168.1.69:1935/live/stream",
        "-loglevel", "error"               // Only log errors
    ]);


    ws.on('message', (data) => {
        totalBytesTransferred += data.length;
        console.log(`Data transferred: ${(totalBytesTransferred / 1048576).toFixed(2)} MB`);
        ffmpeg.stdin.write(data);  // Send data to FFmpeg
    });

    ws.on('close', () => {
        console.log(`Client disconnected, total data: ${(totalBytesTransferred / 1048576).toFixed(2)} MB`);
        ffmpeg.stdin.end();  // Close FFmpeg on disconnect
        activeClient = null;
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        ffmpeg.stdin.end();  // Close FFmpeg on error
        activeClient = null;
    });

    // Handling FFmpeg process errors
    ffmpeg.stderr.on('data', (data) => {
        console.error(`FFmpeg Error: ${data}`);
    });

    ffmpeg.on('exit', (code, signal) => {
        console.log(`FFmpeg exited with code ${code} and signal ${signal}`);
        if (activeClient) {
            activeClient.close(1011, "FFmpeg process ended unexpectedly."); // Close WebSocket if FFmpeg crashes
        }
    });
});
