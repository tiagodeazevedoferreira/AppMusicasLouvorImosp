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

SHEET_ID = "1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc"
DB_URL = "https://appmusicasimosp-default-rtdb.firebaseio.com/"

def normalize_key(musica, artista):
    """Chave única: musica---artista normalizada"""
    key = (unidecode(musica).lower().strip().replace(' ', '-').replace(',', '-') + '---' +
           unidecode(artista).lower().strip().replace(' ', '-').replace(',', '-'))
    return re.sub(r'[^a-z0-9-]', '-', key)

def scrape_cifra_club(url):
    """Extrai CIFRA COMPLETA (com acordes) + LETRA PURA (sem acordes)"""
    if not url:
        return None, None
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        resp = requests.get(url, timeout=15, headers=headers)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'lxml')
        
        # CIFRA COMPLETA (com acordes) - selectors CifraClub
        cifra_div = (soup.find('div', class_='cnt-letra') or 
                     soup.find('div', {'data-testid': 'lyrics-container'}) or
                     soup.find('pre') or
                     soup.find('div', class_=re.compile('lyrics|song|letra|cifra')))
        
        cifra_completa = ''
        if cifra_div and len(cifra_div.get_text(strip=True)) > 50:
            # Detecta acordes para confirmar que é cifra
            texto_teste = cifra_div.get_text()[:500]
            if re.search(r'\b[A-G][#b]?[m7]?\b', texto_teste):
                cifra_completa = cifra_div.get_text(separator='\n', strip=True)[:10000]
        
        # LETRA PURA (sem acordes)
        letra_pura = ''
        all_text = soup.get_text(separator='\n')
        
        # Remove acordes comuns
        acordes_regex = r'\b[A-G][#b]?(m7?|sus|add|\d)?\b'
        letra_pura = re.sub(acordes_regex, '', all_text)
        letra_pura = re.sub(r'Intro|Refrão|Pré-refrão', '', letra_pura, flags=re.IGNORECASE)
        letra_pura = re.sub(r'\n{3,}', '\n\n', letra_pura).strip()
        
        if len(letra_pura) > 200:
            letra_pura = letra_pura[:10000]
        else:
            letra_pura = 'Letra não encontrada'
        
        return cifra_completa or letra_pura, letra_pura  # Prioriza cifra se encontrada
        
    except Exception as e:
        print(f"Erro scraping {url}: {str(e)[:100]}")
        return None, None

def main():
    try:
        # Google Sheets
        scopes = [
            'https://spreadsheets.google.com/feeds',
            'https://www.googleapis.com/auth/drive'
        ]
        creds_dict = json.loads(os.environ['GOOGLESERVICEACCOUNTJSON'])
        creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
        
        client = gspread.authorize(creds)
        sheet = client.open_by_key(SHEET_ID).worksheet('Músicas')
        records = sheet.get_all_records()
        print(f"{len(records)} músicas na planilha")
        
        # Firebase
        cred = credentials.Certificate(creds_dict)
        firebase_admin.initialize_app(cred, {'databaseURL': DB_URL})
        ref = db.reference('musicas')
        
        salvas = 0
        for row in records:
            musica = row.get('Música', '').strip()
            if not musica:
                print("Fim dados")
                break
                
            artista = row.get('Artista', '').strip()
            link = row.get('Cifra', '').strip()
            
            print(f"{musica} - {artista}")
            key = normalize_key(musica, artista)
            
            cifra_completa, letra_pura = scrape_cifra_club(link)
            
            data = {
                'titulo': musica,
                'artista': artista,
                'letra': letra_pura,
                'cifra': cifra_completa,  # NOVA: salva cifra completa
                'url_cifra': link or '',
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            
            ref.child(key).set(data)
            print(f"  SALVO: Cifra({len(cifra_completa or '')} chars) + Letra({len(letra_pura)} chars)")
            salvas += 1
        
        print(f"\n{salvas} MÚSICAS PROCESSADAS COM CIFRA + LETRAS!")
        
    except Exception as e:
        print(f"ERRO GERAL:", e)
        raise

if __name__ == "__main__":
    main()
