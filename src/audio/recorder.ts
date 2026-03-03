export interface RecordingResult {
	blob: Blob;
	durationSeconds: number;
	stream: MediaStream;
}

export class AudioRecorder {
	private mediaRecorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private stream: MediaStream | null = null;
	private startTime = 0;

	async start(): Promise<MediaStream> {
		if (this.mediaRecorder?.state === "recording") {
			throw new Error("Already recording");
		}

		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 1,
				echoCancellation: true,
				autoGainControl: true,
				noiseSuppression: true,
				sampleRate: 16000,
			},
		});

		const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
			? "audio/webm;codecs=opus"
			: "audio/webm";

		this.chunks = [];
		this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
		this.mediaRecorder.ondataavailable = (e) => {
			if (e.data.size > 0) this.chunks.push(e.data);
		};

		this.startTime = Date.now();
		this.mediaRecorder.start(100); // collect chunks every 100ms
		return this.stream;
	}

	stop(): Promise<RecordingResult> {
		return new Promise((resolve, reject) => {
			if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
				reject(new Error("Not recording"));
				return;
			}

			const durationSeconds = (Date.now() - this.startTime) / 1000;
			const stream = this.stream!;

			this.mediaRecorder.onstop = () => {
				const blob = new Blob(this.chunks, {
					type: this.mediaRecorder!.mimeType,
				});
				this.cleanup();
				resolve({ blob, durationSeconds, stream });
			};

			this.mediaRecorder.stop();
			stream.getTracks().forEach((t) => t.stop());
		});
	}

	isRecording(): boolean {
		return this.mediaRecorder?.state === "recording";
	}

	private cleanup(): void {
		this.chunks = [];
		this.mediaRecorder = null;
		this.stream = null;
	}
}
