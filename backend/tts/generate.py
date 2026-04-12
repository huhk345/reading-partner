import hashlib
import os
import re

import soundfile as sf


class TTSEngine:
    _instance = None
    _model = None
    _model_id = "openbmb/VoxCPM1.5"

    # VoxCPM inference parameters
    _cfg_value = 2.0
    _inference_timesteps = 10
    _speed_ratio = 0.9
    _fixed_prompt_path = os.path.join(
        os.path.dirname(__file__), "prompts", "Sulafat.wav"
    )
    _fixed_prompt_text = "What idea do you want to bring to life?"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _get_model(self):
        if self._model is None:
            import torch
            from voxcpm import VoxCPM
            from voxcpm.modules.minicpm4.model import (
                MiniCPMAttention,
                apply_rotary_pos_emb,
            )

            # Monkey-patch MiniCPMAttention.forward_step to fix SDPA mask shape issue on CPU
            def patched_forward_step(
                self_attn,
                hidden_states: torch.Tensor,
                position_emb: tuple[torch.Tensor, torch.Tensor],
                position_id: int,
                kv_cache: tuple[torch.Tensor, torch.Tensor],
            ) -> torch.Tensor:
                bsz, _ = hidden_states.size()

                query_states = self_attn.q_proj(hidden_states)
                key_states = self_attn.k_proj(hidden_states)
                value_states = self_attn.v_proj(hidden_states)

                query_states = query_states.view(
                    bsz, 1, self_attn.num_heads, self_attn.head_dim
                ).transpose(1, 2)
                key_states = key_states.view(
                    bsz, 1, self_attn.num_key_value_heads, self_attn.head_dim
                ).transpose(1, 2)
                value_states = value_states.view(
                    bsz, 1, self_attn.num_key_value_heads, self_attn.head_dim
                ).transpose(1, 2)

                cos, sin = position_emb

                query_states, key_states = apply_rotary_pos_emb(
                    query_states, key_states, cos, sin
                )

                key_cache, value_cache = kv_cache

                key_cache[:, :, position_id, :] = key_states
                value_cache[:, :, position_id, :] = value_states

                attn_mask = (
                    torch.arange(key_cache.size(2), device=key_cache.device)
                    <= position_id
                )
                # Fix: Ensure broadcastable mask shape: (1, 1, 1, L)
                attn_mask = attn_mask.view(1, 1, 1, -1)

                # ref: https://github.com/pytorch/pytorch/issues/163597
                # there is a bug in MPS for non-contiguous tensors, so we need to make them contiguous
                query_states = query_states.contiguous()
                key_cache = key_cache.contiguous()
                value_cache = value_cache.contiguous()
                attn_output = torch.nn.functional.scaled_dot_product_attention(
                    query_states,
                    key_cache,
                    value_cache,
                    attn_mask=attn_mask,
                    enable_gqa=True,
                )

                attn_output = attn_output.transpose(1, 2).contiguous()
                attn_output = attn_output.reshape(
                    bsz, self_attn.num_heads * self_attn.head_dim
                )
                attn_output = self_attn.o_proj(attn_output)

                return attn_output

            # Apply the patch
            MiniCPMAttention.forward_step = patched_forward_step
            print("Patched MiniCPMAttention.forward_step for CPU/MPS compatibility.")

            print(f"Loading VoxCPM model: {self._model_id}...")
            self._model = VoxCPM.from_pretrained(self._model_id)
            # Explicitly move to CPU and float32, and update internal attributes
            # to avoid device/type mismatch in voxcpm's internal methods
            self._model.tts_model.to("cpu").to(torch.float32)
            self._model.tts_model.device = "cpu"
            if hasattr(self._model.tts_model, "config"):
                self._model.tts_model.config.dtype = "float32"

                # Re-setup cache on CPU for the internal language models to ensure KV cache is on CPU
                max_length = getattr(self._model.tts_model.config, "max_length", 4096)
                if hasattr(self._model.tts_model, "base_lm"):
                    self._model.tts_model.base_lm.setup_cache(
                        1, max_length, "cpu", torch.float32
                    )
                if hasattr(self._model.tts_model, "residual_lm"):
                    self._model.tts_model.residual_lm.setup_cache(
                        1, max_length, "cpu", torch.float32
                    )

            print("VoxCPM model loaded on CPU with float32!")
        return self._model

    @staticmethod
    def _preprocess_text(text: str) -> str:
        text = text.strip()
        if not text:
            return text

        # Normalize whitespace
        text = re.sub(r"\s+", " ", text)

        # Ensure text ends with punctuation so the model knows to wind down naturally
        if text and text[-1] not in ".!?":
            text += "."

        return text

    def synthesize(
        self,
        text: str,
        output_dir: str = "uploads/tts",
        prompt_wav_path: str = None,
        prompt_text: str = None,
    ) -> str:
        os.makedirs(output_dir, exist_ok=True)

        # Use fixed prompt if not provided
        if prompt_wav_path is None:
            # Check absolute path or relative to cwd
            if os.path.exists(self._fixed_prompt_path):
                prompt_wav_path = self._fixed_prompt_path
                if prompt_text is None:
                    prompt_text = self._fixed_prompt_text

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

        # Save with adjusted sample rate to control speed
        # Lower sample rate = slower playback (and lower pitch)
        target_sr = int(model.tts_model.sample_rate * self._speed_ratio)
        sf.write(output_path, wav, target_sr)
        return output_path


class LightTTSEngine:
    _instance = None
    _model = None
    _model_id = "tts_models/en/vctk/vits"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _get_model(self):
        if self._model is None:
            from TTS.api import TTS

            print(f"Loading Light TTS model: {self._model_id}...")
            self._model = TTS(self._model_id)
            print("Light TTS model (VITS) loaded!")
        return self._model

    @staticmethod
    def _preprocess_text(text: str) -> str:
        text = text.strip()
        if not text:
            return text
        text = re.sub(r"\s+", " ", text)
        if text and text[-1] not in ".!?":
            text += "."
        return text

    def synthesize(self, text: str, output_dir: str = "uploads/tts") -> str:
        os.makedirs(output_dir, exist_ok=True)

        text_hash = hashlib.md5(text.encode()).hexdigest()
        output_path = os.path.join(output_dir, f"light_{text_hash}.wav")

        if os.path.exists(output_path):
            return output_path

        processed_text = self._preprocess_text(text)

        model = self._get_model()
        model.tts_to_file(
            text=processed_text,
            file_path=output_path,
            speaker="p225",
        )
        return output_path


tts_engine = TTSEngine()
light_tts_engine = LightTTSEngine()
