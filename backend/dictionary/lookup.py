import requests
import sqlite3
import os

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

def lookup_word(word: str):
    """
    Fetches word definition from DictionaryAPI.dev and translation from ECDICT (local DB).
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
