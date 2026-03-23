import hashlib
import os
import re

import numpy as np
import soundfile as sf


class TTSEngine:
    _instance = None
    _model = None
    _model_id = "openbmb/VoxCPM1.5"

    # VoxCPM inference parameters
    _cfg_value = 2.0
    _inference_timesteps = 10

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _get_model(self):
        if self._model is None:
            from voxcpm import VoxCPM
            print(f"Loading VoxCPM model: {self._model_id}...")
            self._model = VoxCPM.from_pretrained(self._model_id)
            print("VoxCPM model loaded successfully!")
        return self._model

    @staticmethod
    def _preprocess_text(text: str) -> str:
        text = text.strip()
        if not text:
            return text

        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text)

        # Ensure text ends with punctuation so the model knows to wind down naturally
        if text and text[-1] not in '.!?':
            text += '.'

        return text

    def synthesize(
        self,
        text: str,
        output_dir: str = "uploads/tts",
        prompt_wav_path: str = None,
        prompt_text: str = None,
    ) -> str:
        os.makedirs(output_dir, exist_ok=True)

        text_hash = hashlib.md5(text.encode()).hexdigest()
        output_path = os.path.join(output_dir, f"{text_hash}.wav")

        if os.path.exists(output_path):
            return output_path

        processed_text = self._preprocess_text(text)

        model = self._get_model()
        wav = model.generate(
            text=processed_text,
            prompt_wav_path=prompt_wav_path,
            prompt_text=prompt_text,
            cfg_value=self._cfg_value,
            inference_timesteps=self._inference_timesteps,
            normalize=False,
            denoise=False,
            retry_badcase=True,
            retry_badcase_max_times=3,
            retry_badcase_ratio_threshold=6.0,
        )

        sf.write(output_path, wav, model.tts_model.sample_rate)
        return output_path


tts_engine = TTSEngine()
