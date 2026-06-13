import requests
import sqlite3
import os
import re
from bs4 import BeautifulSoup

DB_PATH = os.path.join(os.path.dirname(__file__), '../data/ecdict.db')

def get_ecdict_entry(word):
    if not os.path.exists(DB_PATH):
        return None
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT translation, phonetic, definition FROM dictionary WHERE word = ?", (word,))
        result = cursor.fetchone()
        conn.close()
        if result:
            return {
                "translation": result[0],
                "phonetic": result[1],
                "definition": result[2]
            }
    except Exception as e:
        print(f"Error querying ECDICT: {e}")
    return None

def lookup_bing(word: str):
    """
    Fetches word definition from Bing Dictionary (cn.bing.com/dict/search).
    Returns phonetic, Chinese translation, and English definition parsed from HTML.
    """
    url = f"https://cn.bing.com/dict/search?q={word}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    try:
        response = requests.get(url, headers=headers, timeout=8)
        if response.status_code != 200:
            return None

        soup = BeautifulSoup(response.text, "html.parser")

        # Check if the word was found — Bing shows a "no results" area when not found
        no_result = soup.select_one(".qdef .no-results")
        if no_result:
            return None

        phonetic_us = ""
        phonetic_uk = ""

        # Extract phonetics from the header area
        # US: <div class="hd_prUS">美 [...]</div>
        # UK: <div class="hd_pr">英 [...]</div>
        pr_us = soup.select_one(".hd_prUS")
        if pr_us:
            phonetic_us = pr_us.get_text(strip=True)
        pr_uk = soup.select_one(".hd_pr")
        if pr_uk:
            phonetic_uk = pr_uk.get_text(strip=True)

        # Prefer US phonetic
        phonetic = phonetic_us or phonetic_uk

        # Extract quick Chinese translation from the top definition area
        # <div class="qdef"><ul><li>n.词典；字典...</li></ul>
        zh_trans_parts = []
        qdef_ul = soup.select_one(".qdef > ul")
        if qdef_ul:
            for li in qdef_ul.select("li"):
                text = li.get_text(strip=True)
                if text and text != "网络":
                    zh_trans_parts.append(text)

        zh_trans = "\n".join(zh_trans_parts)

        # Extract detailed definitions from the definition area
        # Structure: .df_div > #defid > .auth_area > .li_sen > .each_seg > .de_seg
        # Each definition: .se_lis > .def_pa > .bil (Chinese) + .val (English)
        en_def_parts = []
        zh_detail_parts = []

        for seg in soup.select('.de_seg'):
            pos_el = seg.find_previous(class_='pos')
            pos_text = pos_el.get_text(strip=True) if pos_el else ""

            for se_lis in seg.select('.se_lis'):
                num_el = se_lis.select_one('.se_d')
                num = num_el.get_text(strip=True) if num_el else ""

                bil_el = se_lis.select_one('.bil')
                val_el = se_lis.select_one('.val')

                bil_text = bil_el.get_text(strip=True) if bil_el else ""
                val_text = val_el.get_text(strip=True) if val_el else ""

                if val_text:
                    line = f"{num} {val_text}"
                    en_def_parts.append(line)
                if bil_text:
                    zh_detail_parts.append(f"{num} {bil_text}")

        en_def = "\n".join(en_def_parts)

        # If we got detailed zh translations, prefer those over the quick summary
        if zh_detail_parts:
            zh_trans = "\n".join(zh_detail_parts)

        if not zh_trans and not en_def:
            return None

        return {
            "phonetic": phonetic,
            "zh_trans": zh_trans,
            "en_def": en_def,
        }
    except Exception as e:
        print(f"Error fetching Bing dictionary: {e}")
        return None


def lookup_word(word: str):
    """
    Fetches word definition from DictionaryAPI.dev and translation from ECDICT (local DB).
    Falls back to Bing Dictionary if primary sources yield no results.
    """
    word = word.lower()

    # 1. Fetch English Definition (Free DictionaryAPI)
    api_url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
    en_def = ""
    phonetic = ""
    audio_url = ""

    try:
        response = requests.get(api_url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                entry = data[0]

                phonetics = entry.get("phonetics", [])
                audio_url = ""
                # Start with top-level phonetic as default
                phonetic = entry.get("phonetic", "")

                # Priority: US (2) > UK (1) > Others (0)
                best_audio_priority = -1

                for p in phonetics:
                    p_audio = p.get("audio", "")
                    p_text = p.get("text", "")

                    if p_audio:
                        priority = 0
                        # Check for US/UK in the audio URL
                        if "-us" in p_audio.lower() or "/us/" in p_audio.lower():
                            priority = 2
                        elif "-uk" in p_audio.lower() or "/uk/" in p_audio.lower():
                            priority = 1

                        if priority > best_audio_priority:
                            best_audio_priority = priority
                            audio_url = p_audio
                            # Use the phonetic associated with this audio if it exists
                            if p_text:
                                phonetic = p_text
                    elif best_audio_priority < 0 and p_text and not phonetic:
                        # Fallback to first available phonetic text if no audio found yet and no top-level phonetic
                        phonetic = p_text

                # Extract first definition
                meanings = entry.get("meanings", [])
                if meanings:
                    first_meaning = meanings[0]
                    definitions = first_meaning.get("definitions", [])
                    if definitions:
                        en_def = definitions[0].get("definition", "")
    except Exception as e:
        print(f"Error fetching definition: {e}")

    # 2. Fetch Chinese Translation (ECDICT local DB)
    zh_trans = ""
    ecdict_data = get_ecdict_entry(word)

    if ecdict_data:
        zh_trans = ecdict_data.get("translation", "").replace("\\n", "\n")
        # Use ECDICT phonetic if DictionaryAPI didn't provide one
        if not phonetic and ecdict_data.get("phonetic"):
            phonetic = ecdict_data.get("phonetic")

    # 3. Fallback to Bing Dictionary if primary sources yield no results
    if not en_def and not zh_trans:
        bing_result = lookup_bing(word)
        if bing_result:
            if not phonetic and bing_result.get("phonetic"):
                phonetic = bing_result["phonetic"]
            if not zh_trans and bing_result.get("zh_trans"):
                zh_trans = bing_result["zh_trans"]
            if not en_def and bing_result.get("en_def"):
                en_def = bing_result["en_def"]

    # 4. Combine results
    if not en_def and not zh_trans:
        return None

    # Format the meaning nicely
    combined_meaning = f"{zh_trans}\n\n【Definition】: {en_def}" if zh_trans and en_def else (zh_trans or en_def)

    return {
        "word": word,
        "phonetic": phonetic,
        "meaning": combined_meaning,
        "audio_url": audio_url
    }
