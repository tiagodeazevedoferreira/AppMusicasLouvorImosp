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

SHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc'
DB_URL = 'https://appmusicasimosp-default-rtdb.firebaseio.com/'

def normalize_key(musica, artista):
    """Chave única: musica---artista normalizada"""
    key = f"{unidecode(musica).lower().strip().replace(' ', '-').replace('/', '-') }---{unidecode(artista).lower().strip().replace(' ', '-').replace('/', '-')}"
    return re.sub(r'[^a-z0-9\-]', '-', key)

def scrape_lyrics(url):
    """Extrai letra CifraClub com múltiplos fallbacks (mantido original)"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        resp = requests.get(url, timeout=15, headers=headers)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'lxml')
        
        # Selector principal CifraClub
        letra_div = (soup.find('div', class_='cnt-letra') or
                     soup.find('div', {'data-testid': 'lyrics-container'}) or
                     soup.find('div', class_=re.compile(r'lyric|song|letra|lyrics')) or
                     soup.find('pre'))
        if letra_div and len(letra_div.get_text(strip=True)) > 50:
            texto = letra_div.get_text(separator='\n', strip=True)
            return texto[:10000]  # Limita tamanho
        
        # Fallback: extrai seções com [Parte] + texto
        sections = soup.find_all(['div', 'p', 'span'], string=re.compile(r'^\[.*parte.*\]', re.I))
        if sections:
            letra_parts = []
            for sec in sections:
                sibling = sec.find_next_sibling()
                if sibling:
                    letra_parts.append(sibling.get_text(separator='\n', strip=True))
            if letra_parts:
                return '\n'.join(letra_parts)[:10000]
        
        # Último fallback: texto principal da página (linhas longas)
        content = soup.get_text(separator='\n')
        lines = [line.strip() for line in content.split('\n')
                 if len(line.strip()) > 15 and not re.match(r'^[A-G][a-z#b]?\s', line.strip())]
        letra = '\n'.join(lines[:40])
        return letra if len(letra) > 200 else f"Letra não encontrada em {url}"
    except Exception as e:
        return f"Erro scraping {url}: {str(e)[:100]}"

def scrape_cifra(url):
    """Extrai bloco CIFRA+LETRA como HTML com CSS para alinhamento perfeito (fonte monospace)"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        resp = requests.get(url, timeout=15, headers=headers)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'lxml')
        
        # Container principal com cifras alinhadas
        cifra_div = (soup.find('div', class_='cnt-letra') or
                     soup.find('div', class_='js-cifra') or
                     soup.find('div', {'data-testid': 'lyrics-container'}) or
                     soup.find('div', class_=re.compile(r'cifra|chord|letra|lyrics')) or
                     soup.find('pre', class_=re.compile(r'chord')))
        
        if cifra_div:
            # Extrai HTML bruto preservando spans de acordes
            bloco_html = str(cifra_div)[:15000]
            if len(bloco_html) > 200:
                # Wrapper CSS para renderização perfeita (monospace + positions)
                css_wrapper = '''
<style>
.cifra-container {{
    font-family: 'Courier New', Consolas, 'Lucida Console', monospace !important;
    line-height: 1.2;
    white-space: pre-wrap;
    position: relative;
    font-size: 14px;
    max-width: 600px;
}}
.cifra-container span[class*="chord"], .cifra-container span[class*="acorde"], .cifra-container .acorde {{
    position: absolute;
    font-size: 0.75em;
    color: #007cba;
    font-weight: bold;
    top: -0.8em;
    z-index: 10;
}}
</style>
<div class="cifra-container">{}</div>
                '''.format(bloco_html)
                return css_wrapper
        
        # Fallback 1: Reconstrói com seções [Parte]/Refrão + acordes próximos
        sections = soup.find_all(['div', 'p', 'span'], string=re.compile(r'\[(Parte|Refrão|Pré-Refrão|Intro|Final|.*\]', re.I))
        acordes_spans = soup.find_all('span', class_=re.compile(r'chord|acorde|cifra'))
        if sections or acordes_spans:
            html_parts = [str(sec) for sec in sections[:10]]
            html_parts.extend([str(span) for span in acordes_spans[:30]])  # Cifras simples
            bloco = ''.join(html_parts)[:15000]
            return f'<div class="cifra-container" style="font-family: monospace; line-height: 1.2; white-space: pre;">{bloco}</div>'
        
        # Fallback 2: Todo texto filtrado com monospace
        content = soup.get_text(separator='\n')
        lines = [line.strip() for line in content.split('\n') if len(line.strip()) > 5]
        bloco = '\n'.join(lines[:60])
        if len(bloco) > 300:
            return f'<div class="cifra-container" style="font-family: monospace; white-space: pre-line; line-height: 1.2;">{bloco}</div>'
        
        return f"Cifra não encontrada em {url}"
    
    except Exception as e:
        return f"Erro scraping cifra {url}: {str(e)[:100]}"

def main():
    try:
        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        creds_dict = json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT_JSON'])
        creds = Credentials.from_service_account_info(creds_dict, scopes=scope)
        
        # Sheets
        client = gspread.authorize(creds)
        sheet = client.open_by_key(SHEET_ID).worksheet("Músicas")
        records = sheet.get_all_records()
        print(f"📊 {len(records)} músicas na planilha")
        
        # Firebase
        cred = credentials.Certificate(creds_dict)
        firebase_admin.initialize_app(cred, {'databaseURL': DB_URL})
        ref = db.reference('musicas')
        
        salvas = 0
        for row in records:
            musica = row.get('Música', '').strip()
            if not musica:
                print("📄 Fim dados")
                break
            artista = row.get('Artista', '').strip()
            link = row.get('Cifra', '').strip()
            print(f"🔄 {musica} - {artista}")
            
            key = normalize_key(musica, artista)
            letra = scrape_lyrics(link) if link else "Sem link CifraClub"
            cifra = scrape_cifra(link) if link else "Sem link CifraClub"
            
            data = {
                'letra': letra,
                'cifra': cifra,  # HTML com CSS para alinhamento perfeito
                'artista': artista,
                'url_cifra': link or '',
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            
            ref.child(key).set(data)
            print(f"✅ SALVO | Letra: {len(letra)} chars | Cifra HTML: {len(cifra)} chars")
            salvas += 1
        
        print(f"\n🎉 {salvas} MÚSICAS PROCESSADAS COM LETRAS + CIFRAS ALINHADAS!")
    except Exception as e:
        print(f"❌ ERRO GERAL: {e}")
        raise

if __name__ == '__main__':
    main()
