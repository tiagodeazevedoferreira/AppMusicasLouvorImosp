import gspread
from google.oauth2.service_account import Credentials
import firebase_admin
from firebase_admin import credentials, db
import requests
from bs4 import BeautifulSoup
from unidecode import unidecode
import re
from datetime import datetime
import json
import os

# Configurações
SHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc'
DB_URL = 'https://appmusicasimosp-default-rtdb.firebaseio.com/'

def normalize_key(musica, artista):
    key = f"{unidecode(musica).lower().strip().replace(' ', '-').replace('/', '-') }---{unidecode(artista).lower().strip().replace(' ', '-').replace('/', '-')}"
    return re.sub(r'[^a-z0-9\-]', '-', key)

def scrape_lyrics(url):
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'lxml')
        letra_div = soup.find('div', class_='cnt-letra')
        if letra_div:
            return letra_div.get_text(separator='\n', strip=True)
        return "Letra não encontrada"
    except Exception:
        return "Letra não encontrada"

def main():
    scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
    creds_dict = json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT_JSON'])
    creds = Credentials.from_service_account_info(creds_dict, scopes=scope)
    
    # Sheets
    client = gspread.authorize(creds)
    sheet = client.open_by_key(SHEET_ID).worksheet("Músicas")
    records = sheet.get_all_records()
    print(f"Encontradas {len(records)} linhas na planilha")
    
    # Firebase (inicializa SEM checar existência)
    cred = credentials.Certificate(creds_dict)
    firebase_admin.initialize_app(cred, {'databaseURL': DB_URL})
    ref = db.reference('musicas')
    
    processadas = 0
    for row in records:
        musica = row.get('Música', '').strip()
        if not musica:
            break
            
        artista = row.get('Artista', '').strip()
        link = row.get('Cifra', '').strip()
        
        key = normalize_key(musica, artista)
        
        letra = scrape_lyrics(link) if link else "Letra não encontrada"
        
        data = {
            'letra': letra,
            'artista': artista,
            'url_cifra': link or '',
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # SALVA DIRETO (sem .get() que falha)
        ref.child(key).set(data)
        print(f"✅ Salvo: {musica} - {artista} | Letra: {len(letra)} chars")
        processadas += 1
    
    print(f"\n🎉 FINALIZADO: {processadas} músicas salvas no Firebase!")

if __name__ == '__main__':
    main()
