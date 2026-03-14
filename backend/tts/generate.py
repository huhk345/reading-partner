import hashlib
import os

class TTSEngine:
    _instance = None
    _tts = None
    _model_name = "tts_models/en/vctk/vits"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _get_tts(self):
        if self._tts is None:
            from TTS.api import TTS
            print(f"Loading TTS model: {self._model_name}...")
            self._tts = TTS(model_name=self._model_name, gpu=False)
            # Slow down the TTS speed a little bit (1.1x duration)
            if hasattr(self._tts, 'synthesizer') and hasattr(self._tts.synthesizer, 'tts_model'):
                self._tts.synthesizer.tts_model.length_scale = 1.1
            print("TTS model loaded successfully!")
        return self._tts

    def synthesize(self, text: str, output_dir: str = "uploads/tts", speaker: str = "p225") -> str:
        os.makedirs(output_dir, exist_ok=True)
        
        text_hash = hashlib.md5(text.encode()).hexdigest()
        output_path = os.path.join(output_dir, f"{text_hash}.wav")
        
        if os.path.exists(output_path):
            return output_path
        
        tts = self._get_tts()
        tts.tts_to_file(text=text, file_path=output_path, speaker=speaker)
        return output_path

tts_engine = TTSEngine()
