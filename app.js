const SHEET_ID = '1OuMaJ-nyFujxE-QNoZCE8iyaPEmRfJLHWr5DfevX6cc';
const SHEET_TAB = 'Músicas';
let musicas = [];
let dadosFirebaseMap = new Map();

function normalizarNome(nome, artista) {
    const nomeNorm = nome?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const artistaNorm = artista?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    return `${nomeNorm}---${artistaNorm}`;
}

async function carregarDados() {
    console.log('🚀 Carregando CSV PÚBLICO (SEM API KEY!)');
    const container = document.getElementById('resultados');
    container.innerHTML = `<div class="col-12 text-center py-5"><div class="spinner-border text-primary"></div><p>Carregando...</p></div>`;

    try {
        // CSV PÚBLICO GOOGLE SHEETS - SEM API KEY! [web:30]
        const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`;
        console.log('📊 CSV URL:', csvUrl);
        
        const res = await fetch(csvUrl);
        console.log('✅ Status CSV:', res.status);
        
        if (!res.ok) throw new Error(`CSV falhou: ${res.status}`);
        
        const csvText = await res.text();
        const linhas = csvText.split('\n').filter(l => l.trim());
        musicas = linhas.slice(1).map(linha => {
            const cols = linha.split(',').map(c => c.trim().replace(/"/g, ''));
            return {
                nome: cols[0],
                tom: cols[1],
                artista: cols[2],
                link: cols[3],
                data: cols[4]
            };
        }).filter(m => m.nome);
        
        console.log('✅ CSV OK:', musicas.length, 'músicas');

        // FIREBASE (continua igual)
        if (window.firebaseDb) {
            try {
                const { ref, get } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
                const dbRef = ref(window.firebaseDb, 'musicas/');
                const snapshot = await get(dbRef);
                if (snapshot.exists()) {
                    const dados = snapshot.val();
                    Object.keys(dados).forEach(chave => {
                        dadosFirebaseMap.set(chave, {
                            letra: dados[chave].letra || 'Letra não encontrada',
                            cifra: dados[chave].cifra || 'Cifra não encontrada',
                            url_cifra: dados[chave].url_cifra || ''
                        });
                    });
                    console.log('✅ Firebase:', dadosFirebaseMap.size, 'cifras');
                }
            } catch (e) {
                console.warn('Firebase off:', e);
            }
        }

        preencherFiltros();
        filtrarEMostrar();
    } catch (err) {
        console.error('💥 ERRO:', err);
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-exclamation-triangle display-1 text-warning"></i>
                <p><strong>${err.message}</strong></p>
                <p class="text-muted">
                    1️⃣ Planilha → Arquivo → Compartilhar → "Qualquer pessoa com link"<br>
                    2️⃣ F12 deve mostrar "✅ Status CSV: 200"
                </p>
            </div>
        `;
    }
}

// ... (resto das funções iguais: preencherFiltros, filtrarEMostrar, mostrarResultados, limparFiltros)

function preencherFiltros() {
    const artistas = [...new Set(musicas.map(m => m.artista))].sort();
    preencherSelect('filtroArtista', artistas);
    
    const datas = [...new Set(musicas.map(m => m.data).filter(Boolean))].sort((a, b) => b.localeCompare(a, 'pt-BR'));
    preencherSelect('filtroData', datas);
    
    const nomesMusicas = [...new Set(musicas.map(m => m.nome))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    preencherSelect('filtroMusica', nomesMusicas);
}

function preencherSelect(id, lista) {
    const select = document.getElementById(id);
    while (select.options.length > 1) select.remove(1);
    lista.forEach(valor => select.add(new Option(valor, valor)));
}

function filtrarEMostrar() {
    const filtros = {
        nome: document.getElementById('filtroNome')?.value?.trim().toLowerCase(),
        musica: document.getElementById('filtroMusica')?.value,
        artista: document.getElementById('filtroArtista')?.value,
        data: document.getElementById('filtroData')?.value,
        letra: document.getElementById('filtroLetra')?.value?.trim().toLowerCase()
    };

    const filtrados = musicas.filter(m => {
        if (filtros.nome && !m.nome.toLowerCase().includes(filtros.nome)) return false;
        if (filtros.musica && m.nome !== filtros.musica) return false;
        if (filtros.artista && m.artista !== filtros.artista) return false;
        if (filtros.data && m.data !== filtros.data) return false;
        if (filtros.letra) {
            const chave = normalizarNome(m.nome, m.artista);
            const dadosFb = dadosFirebaseMap.get(chave);
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
                <h4 class="mt-3 text-muted">Nenhuma música encontrada</h4>
            </div>
        `;
        return;
    }

    container.innerHTML = lista.map(m => {
        const chaveCompleta = normalizarNome(m.nome, m.artista);
        const chaveSimples = normalizarNome(m.nome, '');
        const dadosFb = dadosFirebaseMap.get(chaveCompleta) || dadosFirebaseMap.get(chaveSimples);
        const letra = dadosFb?.letra || 'Letra não encontrada';
        const cifra = dadosFb?.cifra || 'Cifra não encontrada';
        const videoId = m.link?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];

        return `
            <div class="col-12 col-lg-6 col-xl-4">
                <div class="card musica-card h-100 shadow-lg">
                    <div class="card-body">
                        <h5 class="card-title fw-bold mb-1">${m.nome}</h5>
                        <p class="card-text mb-3 small">
                            ${m.artista ? `<i class="bi bi-person-fill me-1"></i>${m.artista}` : 'Não informado'}<br>
                            ${m.tom ? `<i class="bi bi-music-note-list me-1"></i>${m.tom}` : ''} 
                            ${m.data ? `<i class="bi bi-calendar me-1">${m.data}</i>` : ''}
                        </p>
                        
                        ${videoId ? `
                            <iframe class="w-100 rounded mb-3" height="180" src="https://www.youtube.com/embed/${videoId}" 
                                    title="${m.nome}" allowfullscreen loading="lazy"></iframe>
                        ` : ''}
                        
                        <ul class="nav nav-tabs nav-tabs-custom mb-3">
                            <li class="nav-item">
                                <button class="nav-link active" id="cifra-tab-${m.nome.replace(/[^a-zA-Z0-9]/g,'')}" 
                                        data-bs-toggle="tab" data-bs-target="#cifra-${m.nome.replace(/[^a-zA-Z0-9]/g,'')}" type="button">
                                    <i class="bi bi-guitar me-1"></i>Cifras
                                </button>
                            </li>
                            <li class="nav-item">
                                <button class="nav-link" id="letra-tab-${m.nome.replace(/[^a-zA-Z0-9]/g,'')}" 
                                        data-bs-toggle="tab" data-bs-target="#letra-${m.nome.replace(/[^a-zA-Z0-9]/g,'')}" type="button">
                                    <i class="bi bi-file-earmark-text me-1"></i>Letra
                                </button>
                            </li>
                        </ul>
                        
                        <div class="tab-content">
                            <div class="tab-pane fade show active" id="cifra-${m.nome.replace(/[^a-zA-Z0-9]/g,'')}" role="tabpanel">
                                <div class="cifra">${cifra}</div>
                            </div>
                            <div class="tab-pane fade" id="letra-${m.nome.replace(/[^a-zA-Z0-9]/g,'')}" role="tabpanel">
                                <div class="letra">${letra}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.limparFiltros = () => {
    ['filtroNome', 'filtroLetra'].forEach(id => document.getElementById(id).value = '');
    ['filtroMusica', 'filtroArtista', 'filtroData'].forEach(id => document.getElementById(id).selectedIndex = 0);
    filtrarEMostrar();
};

document.addEventListener('DOMContentLoaded', carregarDados);
['filtroNome', 'filtroLetra'].forEach(id => document.getElementById(id)?.addEventListener('input', filtrarEMostrar));
['filtroMusica', 'filtroArtista', 'filtroData'].forEach(id => document.getElementById(id)?.addEventListener('change', filtrarEMostrar));
