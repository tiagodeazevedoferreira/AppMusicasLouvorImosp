import gspread
from google.oauth2.service_account import Credentials
import firebase_admin
from firebase_admin import credentials, db
import requests
from bs4 import BeautifulSoup
from unidecode import unidecode
import re
from datetime import datetime, timezone
import json
import os
from copy import deepcopy

SHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc'
DB_URL = 'https://appmusicasimosp-default-rtdb.firebaseio.com/'

def normalize_key(musica, artista):
    key = f"{unidecode(musica).lower().strip().replace(' ', '-').replace('/', '-') }---{unidecode(artista).lower().strip().replace(' ', '-').replace('/', '-')}"
    return re.sub(r'[^a-z0-9\-]', '-', key)

def scrape_letra_and_cifra(url):
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        resp = requests.get(url, timeout=15, headers=headers)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'lxml')
        
        letra_div = (soup.find('div', class_='cnt-letra') or 
                     soup.find('div', {'data-testid': 'lyrics-container'}) or
                     soup.find('div', class_=re.compile(r'lyric|song|letra|lyrics')) or
                     soup.find('pre'))
        
        if letra_div and len(letra_div.get_text(strip=True)) > 50:
            cifra = letra_div.get_text(separator='\n', strip=True)
            
            letra_div_copy = deepcopy(letra_div)
            for chord in letra_div_copy.find_all(['span', 'b', 'strong'], class_=re.compile(r'(chord|cnt-chord|cifra_chord)', re.I)):
                chord.decompose()
            letra = letra_div_copy.get_text(separator='\n', strip=True)
            
            return letra[:10000], cifra[:10000]
        
        # Fallback simples
        content = soup.get_text(separator='\n')
        lines = [line.strip() for line in content.split('\n') if len(line.strip()) > 15]
        texto = '\n'.join(lines[:50])
        return texto if len(texto) > 200 else f"Letra não encontrada em {url}", texto
        
    except Exception as e:
        err = f"Erro ao raspar {url}: {str(e)[:120]}"
        return err, err

def main():
    try:
        json_str = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON', '').strip()
        if not json_str:
            raise ValueError("❌ GOOGLE_SERVICE_ACCOUNT_JSON está vazio ou não definido no secret!")
        
        try:
            creds_dict = json.loads(json_str)
        except json.JSONDecodeError as json_err:
            raise ValueError(f"❌ JSON inválido no secret: {str(json_err)}")
        
        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        creds = Credentials.from_service_account_info(creds_dict, scopes=scope)
        
        client = gspread.authorize(creds)
        sheet = client.open_by_key(SHEET_ID).worksheet("Musicas")  # ← Alterado aqui: sem acento
        records = sheet.get_all_records()
        print(f"📊 Encontradas {len(records)} linhas na aba Musicas")
        
        cred = credentials.Certificate(creds_dict)
        firebase_admin.initialize_app(cred, {'databaseURL': DB_URL})
        ref = db.reference('musicas')
        
        salvas = 0
        for row in records:
            musica = row.get('Música', '').strip()
            if not musica:
                print("📄 Linha vazia → fim dos dados")
                break
            
            artista = row.get('Artista', '').strip()
            link_cifraclub = row.get('Cifra', '').strip()          # Coluna F
            url_imagem_cifra = row.get('Cifra_Imagem', '').strip() # Coluna H (nova)
            
            print(f"Processando: {musica} - {artista}")
            key = normalize_key(musica, artista)
            
            letra, cifra = scrape_letra_and_cifra(link_cifraclub) if link_cifraclub else ("Sem cifra club", "Sem cifra club")
            
            data = {
                'letra': letra,
                'cifra': cifra,               # texto com acordes (do Cifra Club)
                'artista': artista,
                'urlcifra': link_cifraclub,
                'url_imagem_cifra': url_imagem_cifra,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            
            ref.child(key).set(data)
            print(f"✅ Salvo → Letra: {len(letra)} chars | Cifra texto: {len(cifra)} chars | Imagem Drive: {url_imagem_cifra[:60]}...")
            salvas += 1
        
        print(f"\n🎉 Concluído! {salvas} músicas processadas.")
        
    except Exception as e:
        print(f"❌ ERRO GERAL: {str(e)}")
        raise

if __name__ == '__main__':
    main()