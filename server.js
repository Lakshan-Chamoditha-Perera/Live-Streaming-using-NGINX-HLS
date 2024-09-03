const WebSocket = require('ws');
const express = require('express');
const path = require('path');
const {spawn} = require('child_process');

const app = express();
const port = 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Start the HTTP server
const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// Create WebSocket server
const wss = new WebSocket.Server({server});

wss.on('connection', (ws) => {
    console.log('New client connected');

    // Start ffmpeg process for creating HLS segments
    const ffmpeg = spawn('ffmpeg', [
        '-re',                  // Read input at native frame rate
        '-i', '-',              // Input from pipe (assuming stdin is receiving the video data)
        '-c:v', 'libx264',      // Encode video using H.264 codec
        '-preset', 'veryfast',  // Use a veryfast preset for lower latency
        '-g', '50',             // Set GOP size (keyframe interval)
        '-sc_threshold', '0',   // Disable scene change detection
        '-c:a', 'aac',          // Encode audio using AAC codec (optional)
        '-ar', '44100',         // Set audio sample rate (optional)
        '-b:a', '128k',         // Set audio bitrate (optional)
        '-f', 'hls',            // Output format set to HLS
        '-hls_time', '4',       // Set duration of each segment in seconds
        '-hls_list_size', '10', // Number of entries in the playlist
        '-hls_flags', 'delete_segments', // Automatically delete old segments (optional)
        '-hls_segment_filename', '/tmp/hls/segment_%03d.ts', // Pattern for segment filenames
        '/tmp/hls/stream.m3u8'  // HLS playlist file output
    ]);

    // Listen for data from the WebSocket and write it to ffmpeg's stdin
    ws.on('message', (message) => {
        console.log('Received video chunk: ', message.length);
        try {
            ffmpeg.stdin.write(message);
            console.log("Data written to ffmpeg");
        } catch (error) {
            console.error('Error writing to ffmpeg stdin:', error);
        }
    });

    // Handle WebSocket connection close event
    ws.on('close', () => {
        console.log('Client disconnected');
        cleanupFfmpegProcess(ffmpeg);
    });

    // Handle WebSocket errors
    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        cleanupFfmpegProcess(ffmpeg);
    });

    // Handle errors from the ffmpeg process
    ffmpeg.stdin.on('error', (err) => {
        console.error('ffmpeg stdin error:', err);
        if (err.code === 'EPIPE') {
            console.log('EPIPE error: Attempted to write to a closed pipe');
        }
    });

    // Capture output and errors from the ffmpeg process
    ffmpeg.stderr.on('data', (data) => {
        console.error('ffmpeg stderr:', data.toString());
    });

    ffmpeg.on('exit', (code, signal) => {
        console.log(`ffmpeg process exited with code ${code} and signal ${signal}`);
    });

    ffmpeg.on('error', (err) => {
        console.error('ffmpeg process error:', err);
    });

    // Function to clean up the ffmpeg process
    function cleanupFfmpegProcess(ffmpegProcess) {
        if (ffmpegProcess && ffmpegProcess.stdin) {
            ffmpegProcess.stdin.end(); // End the stdin stream
        }
        ffmpegProcess.kill('SIGINT'); // Gracefully terminate the ffmpeg process
    }
});

