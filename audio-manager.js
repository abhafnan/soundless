export class AudioManager {
    constructor() {
        this.ctx = null;
        this.analyzer = null;
        this.stream = null;
        this.dataArray = null;
        this.micEnabled = false;
        this.currentVolume = 0;
        this.isWhispering = false;
    }

    async init() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.ctx.createMediaStreamSource(this.stream);
            this.analyzer = this.ctx.createAnalyser();
            this.analyzer.fftSize = 256;
            source.connect(this.analyzer);
            
            const bufferLength = this.analyzer.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
            this.micEnabled = true;
            console.log("Audio initialized");
        } catch (err) {
            console.warn("Microphone access denied or not available", err);
            this.micEnabled = false;
        }
    }

    update() {
        if (!this.micEnabled || !this.analyzer) return 0;

        this.analyzer.getByteFrequencyData(this.dataArray);
        
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }
        
        // Normalize to 0-100
        const average = sum / this.dataArray.length;
        this.currentVolume = Math.min(100, (average / 128) * 100);
        
        // Detect whisper (Low sustained volume)
        // Noise thresholds: < 5 ambient, 5-20 whisper, > 20 talk/shout
        this.isWhispering = this.currentVolume > 8 && this.currentVolume < 25;
        
        return this.currentVolume;
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.ctx) {
            this.ctx.close();
        }
    }
}
