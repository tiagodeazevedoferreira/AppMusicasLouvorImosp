const SHEETID = "1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc";
const SHEETTAB = "Musicas";  // Nome exato da aba (corrigido do gid)
const APIKEY = "AIzaSyAVdsQ-1qWuxN74IBtKy3YXUmSKBZT6uWQ";  // NOVA CHAVE

let musicas = [];
let dadosFirebaseMap = new Map();

function normalizarNome(nome, artista) {
  const nomeNorm = nome?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const artistaNorm = artista?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  return nomeNorm + '---' + artistaNorm;
}

async function carregarDados() {
  console.log('Iniciando...');
  const container = document.getElementById('resultados');
  container.innerHTML = `
    <div class="col-12 text-center py-5">
      <div class="spinner-border text-primary"></div>
      <p>Carregando...</p>
    </div>
  `;

  try {
    // PLANILHA - URL corrigida com nome da aba
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETID}/values/${encodeURIComponent(SHEETTAB)}!A:E?key=${APIKEY}`;
    console.log('URL Planilha:', url);  // Para debug

    const res = await fetch(url);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Planilha ${res.status}: ${errorText}`);
    }
    const data = await res.json();
    musicas = data.values
      ?.slice(1)
      .map(row => ({
        nome: row[0]?.trim(),
        tom: row[1]?.trim(),
        artista: row[2]?.trim(),
        link: row[3]?.trim(),
        data: row[4]?.trim()
      }))
      .filter(m => m.nome);
    console.log('Planilha OK,', musicas.length, 'músicas');

    // FIREBASE LETRAS (opcional)
    if (window.firebaseDb) {
      try {
        const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
        const dbRef = ref(window.firebaseDb, 'musicas');
        const snapshot = await get(dbRef);
        if (snapshot.exists()) {
          const dados = snapshot.val();
          Object.keys(dados).forEach(chave => {
            dadosFirebaseMap.set(chave, {
              letra: dados[chave].letra || 'Letra não encontrada',
              urlcifra: dados[chave].urlcifra || '',
              cifra: dados[chave].cifra || '',  // Campo opcional de cifra texto
              url_imagem_cifra: dados[chave].url_imagem_cifra || ''  // Novo campo de imagem
            });
          });
          console.log('Firebase OK,', dadosFirebaseMap.size, 'letras');
        }
      } catch (e) {
        console.warn('Firebase off:', e);
      }
    }

    preencherFiltros();
    filtrarEMostrar();
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
        <p>Erro planilha. <strong>Rode scraper primeiro!</strong></p>
      </div>
    `;
  }
}

function preencherSelect(id, options) {
  const select = document.getElementById(id);
  select.innerHTML = '<option value="">Todos/Todas</option>' + options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
}

function preencherFiltros() {
  const artistas = [...new Set(musicas.map(m => m.artista))].sort();
  preencherSelect('filtroArtista', artistas);

const datas = [...new Set(musicas.map(m => m.data).filter(Boolean))]
  .sort((a, b) => {
    const [da, ma, aa] = a.split('/');
    const [db, mb, ab] = b.split('/');
    return new Date(aa, ma - 1, da) - new Date(ab, mb - 1, db);
  });

  const nomesMusicas = [...new Set(musicas.map(m => m.nome))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  preencherSelect('filtroMusica', nomesMusicas);
}

function filtrarEMostrar() {
  const filtros = {
    nome: document.getElementById('filtroNome')?.value.trim().toLowerCase() || '',
    musica: document.getElementById('filtroMusica')?.value.trim() || '',
    artista: document.getElementById('filtroArtista')?.value.trim() || '',
    data: document.getElementById('filtroData')?.value.trim() || '',
    letra: document.getElementById('filtroLetra')?.value.trim().toLowerCase() || ''
  };

  const filtrados = musicas.filter(m => {
    if (filtros.nome && !m.nome.toLowerCase().includes(filtros.nome)) return false;
    if (filtros.musica && m.nome !== filtros.musica) return false;
    if (filtros.artista && m.artista !== filtros.artista) return false;
    if (filtros.data && m.data !== filtros.data) return false;
    if (filtros.letra) {
      const dadosFb = dadosFirebaseMap.get(normalizarNome(m.nome, m.artista)) || dadosFirebaseMap.get(normalizarNome(m.nome, ''));
      return (dadosFb?.letra?.toLowerCase().includes(filtros.letra) ||
              normalizarNome(m.nome, '').includes(filtros.letra));
    }
    return true;
  });

  mostrarResultados(filtrados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
}

function mostrarResultados(lista) {
  const container = document.getElementById('resultados');
  if (!lista.length) {
    container.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-music-note-beamed display-1 text-muted"></i>
        <h4 class="mt-3 text-muted">Nenhuma música</h4>
      </div>
    `;
    return;
  }

  container.innerHTML = lista.map(m => {
    const chaveCompleta = normalizarNome(m.nome, m.artista);
    const chaveSimples = normalizarNome(m.nome, '');
    const dadosFb = dadosFirebaseMap.get(chaveCompleta) || dadosFirebaseMap.get(chaveSimples);
    
    const letra = dadosFb?.letra || 'Letra não encontrada';
    const cifraTexto = dadosFb?.cifra || ''; // se ainda tiver o campo texto (opcional)
    const urlImagemCifra = dadosFb?.url_imagem_cifra || ''; // NOVO CAMPO
    const videoId = m.link?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];

    return `
      <div class="col-12 col-lg-6 col-xl-4">
        <div class="card musica-card h-100 shadow-lg">
          <div class="card-body">
            <h5 class="card-title fw-bold mb-1">${m.nome}</h5>
            <p class="card-text mb-3 small">
              ${m.artista ? `<i class="bi bi-person-fill me-1">${m.artista}</i>` : 'Não informado'}<br>
              ${m.tom ? `<i class="bi bi-music-note-list me-1">${m.tom}</i>` : 'Não informado'}
              ${m.data ? `<br><i class="bi bi-calendar me-1">${m.data}</i>` : ''}
            </p>
            ${videoId ? `
              <iframe class="w-100 rounded mb-3" height="180" src="https://www.youtube.com/embed/${videoId}" title="${m.nome}" allowfullscreen loading="lazy"></iframe>
            ` : ''}
			<details class="mb-3">
			  <summary class="btn btn-light btn-sm w-100 mb-2 fw-bold"><i class="bi bi-file-earmark-music me-1"></i>Cifra</summary>
			  <div class="cifra bg-light p-3 rounded small text-center" style="font-family:monospace; overflow-y: hidden; max-height: none;">
				${urlImagemCifra 
				  ? `
					<img src="${urlImagemCifra}" alt="Cifra da música ${m.nome}" class="img-fluid rounded shadow-sm" loading="lazy" style="max-width:100%; height:auto; display:block; margin:0 auto;">
				  `
				  : `
					<p class="text-muted my-3">Cifra (imagem) não disponível</p>
					${cifraTexto ? `<pre class="mt-3 text-start small" style="white-space: pre-wrap; background:#f8f9fa; padding:10px; border-radius:6px;">${cifraTexto}</pre>` : ''}
				  `
				}
			  </div>
			</details>
            <details>
              <summary class="btn btn-outline-light btn-sm w-100 fw-bold"><i class="bi bi-file-earmark-text me-1"></i>Letra</summary>
              <div class="letra bg-light p-3 rounded small" style="font-family:Georgia,serif;line-height:1.6;max-height:280px;overflow-y:auto;">${letra}</div>
            </details>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Limpar filtros
window.limparFiltros = () => {
  ['filtroNome', 'filtroLetra'].forEach(id => document.getElementById(id).value = '');
  ['filtroMusica', 'filtroArtista', 'filtroData'].forEach(id => document.getElementById(id).selectedIndex = 0);
  filtrarEMostrar();
};

// Init
document.addEventListener('DOMContentLoaded', carregarDados);
['filtroNome', 'filtroLetra'].forEach(id => document.getElementById(id)?.addEventListener('input', filtrarEMostrar));
['filtroMusica', 'filtroArtista', 'filtroData'].forEach(id => document.getElementById(id)?.addEventListener('change', filtrarEMostrar));