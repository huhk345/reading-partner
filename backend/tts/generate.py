import hashlib
import os
import re

class TTSEngine:
    _instance = None
    _tts = None
    _model_name = "tts_models/en/vctk/vits"

    # Naturalness tuning parameters
    # length_scale: >1 = slower speech. 1.15 gives a relaxed, natural pace
    # inference_noise_scale: prosody variation. 0.8 adds expressive intonation
    # inference_noise_scale_dp: duration randomness. 0.9 makes rhythm less robotic
    _length_scale = 1.15
    _inference_noise_scale = 0.8
    _inference_noise_scale_dp = 0.9

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _get_tts(self):
        if self._tts is None:
            from TTS.api import TTS
            print(TTS().list_models())
            print(f"Loading TTS model: {self._model_name}...")
            self._tts = TTS(model_name=self._model_name, gpu=False)

            if hasattr(self._tts, 'synthesizer') and hasattr(self._tts.synthesizer, 'tts_model'):
                model = self._tts.synthesizer.tts_model
                model.length_scale = self._length_scale
                model.inference_noise_scale = self._inference_noise_scale
                model.inference_noise_scale_dp = self._inference_noise_scale_dp

            print("TTS model loaded successfully!")
        return self._tts

    @staticmethod
    def _preprocess_text(text: str) -> str:
        text = text.strip()
        if not text:
            return text

        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text)

        # Expand common contractions for clearer pronunciation
        contractions = {
            "can't": "cannot", "won't": "will not", "n't": " not",
            "'re": " are", "'ve": " have", "'ll": " will",
            "'d": " would", "'m": " am",
            "it's": "it is", "that's": "that is",
            "there's": "there is", "here's": "here is",
            "what's": "what is", "who's": "who is",
            "he's": "he is", "she's": "she is",
            "let's": "let us",
        }
        for contraction, expansion in contractions.items():
            text = re.sub(re.escape(contraction), expansion, text, flags=re.IGNORECASE)

        # Add slight pause after commas and semicolons for natural rhythm
        text = re.sub(r',\s*', ', ', text)
        text = re.sub(r';\s*', '; ', text)

        # Ensure sentence-ending punctuation is clean
        text = re.sub(r'\.{2,}', '...', text)
        text = text.strip()

        # Ensure text ends with punctuation so the model knows to wind down naturally
        if text and text[-1] not in '.!?':
            text += '.'

        return text

    def synthesize(self, text: str, output_dir: str = "uploads/tts", speaker: str = "p225") -> str:
        os.makedirs(output_dir, exist_ok=True)

        text_hash = hashlib.md5(text.encode()).hexdigest()
        output_path = os.path.join(output_dir, f"{text_hash}.wav")

        if os.path.exists(output_path):
            return output_path

        processed_text = self._preprocess_text(text)

        tts = self._get_tts()
        tts.tts_to_file(text=processed_text, file_path=output_path, speaker=speaker)
        return output_path

tts_engine = TTSEngine()
