# SISREG AIH Client - Browser Extension

🏥 **Extensão para navegador que facilita a extração, gerenciamento e análise de dados AIH no sistema SISREG III**

## 📋 Funcionalidades

### 🔍 Consultas Individuais
- **Obter Detalhes AIH**: Extração completa de informações de uma solicitação específica
- **Obter Número AIH**: Extração apenas do número da AIH para consulta rápida

### 🏥 Gestão de Internações
- **Enviar Internação**: Registro de internação com data e médico responsável
- **Internar + Alta + AIH**: Processo automatizado completo (internação → alta → extração AIH)

### 📤 Gestão de Altas
- **Enviar Alta**: Registro de alta hospitalar com diferentes motivos:
  - Alta Habitual (38)
  - Evasão (42) 
  - Transferência Externa (53)
- **Obter AIH + Alta Condicional**: Extração de AIH com alta automática quando necessário

### 📊 Exportações em Massa
- **Exportar Hospitalizações**: Download de todas as hospitalizações em formato CSV
- **Exportar Autorizações**: Download de todas as autorizações em formato CSV
- **Exportar Tudo (SISREG)**: Exportação unificada completa de todos os dados

## 🚀 Instalação

### Método 1: Instalação Local (Desenvolvedor)

1. **Clone ou baixe este repositório**
2. **Abra o Chrome/Edge** e navegue para `chrome://extensions/`
3. **Ative o "Modo do desenvolvedor"** (canto superior direito)
4. **Clique em "Carregar sem compactação"**
5. **Selecione a pasta** contendo os arquivos da extensão
6. **A extensão será instalada** e aparecerá na barra de ferramentas

### Método 2: Instalação via .crx (Futuro)
```bash
# Empacotar extensão (quando disponível)
chrome --pack-extension=/caminho/para/extensao
```

## 🎯 Como Usar

### Pré-requisitos
- ✅ Navegador Chrome, Edge ou similar (Manifest V3)
- ✅ Acesso ao sistema **sisregiii.saude.gov.br**
- ✅ Login ativo no SISREG

### Uso Básico

1. **Navegue para** `https://sisregiii.saude.gov.br`
2. **Faça login** normalmente no sistema
3. **Clique no ícone da extensão** na barra de ferramentas
4. **Aguarde** o indicador "🏥 SISREG Extension Ativa" aparecer
5. **Use as funções** disponíveis no popup da extensão

### Funcionalidades Detalhadas

#### 📋 Consultas Individuais
```javascript
// Exemplo de uso via console (opcional)
SISREG.api.getAihDetalhe('123456').then(console.log);
```

#### 🏥 Gestão de Internações
- Preencha **código da solicitação**
- Defina **data de internação**
- Informe **CPF do médico**
- Clique em **"Enviar Internação"** ou **"Internar + Alta + AIH"**

#### 📊 Exportações em Massa
- **Configure a concorrência** (recomendado: 6)
- **Clique na função desejada**
- **Aguarde o processamento** (pode levar vários minutos)
- **Arquivo CSV será baixado automaticamente**

## ⚙️ Configurações

### Acesso às Configurações
- Clique no ícone da extensão → **"Opções"**
- Ou navegue para `chrome://extensions/` → **Detalhes** → **Opções da extensão**

### Configurações Disponíveis

#### 🔧 Gerais
- **Logs detalhados**: Habilita/desabilita logs no console
- **Concorrência**: Número de requisições simultâneas (1-10)
- **Timeout**: Tempo limite para requisições (10-300s)
- **Delimitador CSV**: `;` | `,` | `⭾`

#### 🔄 Retry
- **Tentativas máximas**: Quantas vezes tentar novamente (1-10)
- **Delay mínimo**: Tempo de espera entre tentativas (100-5000ms)

#### 📋 Exportação  
- **BOM**: Adiciona Byte Order Mark para compatibilidade com Excel
- **Auto-download**: Download automático dos arquivos CSV

## 🏗️ Estrutura do Projeto

```
sisreg-extension/
├── manifest.json          # Manifesto da extensão
├── background.js          # Service Worker
├── content.js             # Content Script
├── sisreg-client.js       # Cliente SISREG principal
├── popup.html             # Interface do popup
├── popup.css              # Estilos do popup
├── popup.js               # Lógica do popup
├── options.html           # Página de opções
├── options.js             # Lógica das opções
└── icons/                 # Ícones da extensão
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## 🔒 Permissões

A extensão solicita as seguintes permissões:

- **`activeTab`**: Acesso à aba ativa para injeção de scripts
- **`storage`**: Armazenamento de configurações do usuário  
- **`downloads`**: Download de arquivos CSV
- **`https://sisregiii.saude.gov.br/*`**: Acesso ao domínio do SISREG

## 🐛 Solução de Problemas

### Extensão não ativa
- ✅ Verifique se está em `sisregiii.saude.gov.br`
- ✅ Faça login no sistema
- ✅ Recarregue a página
- ✅ Reinstale a extensão se necessário

### Operações falhando
- ✅ Reduza a concorrência para 2-4
- ✅ Aumente o timeout para 60s
- ✅ Verifique logs no console (`F12`)
- ✅ Tente novamente após alguns minutos

### CSV não baixando
- ✅ Permita downloads no navegador
- ✅ Verifique bloqueadores de popup
- ✅ Habilite "Auto-download" nas opções

## 🔧 Desenvolvimento

### Pré-requisitos
- Node.js (opcional, para futuras melhorias)
- Conhecimento em JavaScript ES5/ES6
- Familiaridade com Chrome Extension APIs

### Estrutura da API SISREG
```javascript
window.SISREG = {
  config: { /* configurações */ },
  http: { /* cliente HTTP */ },
  utils: { /* utilitários */ },
  parsers: { /* parsers HTML */ },
  endpoints: { /* URLs da API */ },
  api: { /* funções principais */ }
};
```

### Principais Funções
- `getAihDetalhe(codSol)`: Obter detalhes completos
- `pegaNumeroAih(codSol)`: Obter apenas número AIH
- `enviarInternacao(codSol, data, medico)`: Enviar internação
- `enviarAlta(motivo, codSol)`: Enviar alta
- `crawlSisreg(opts)`: Exportação completa

## 📊 Dados Exportados

### Campos CSV Principais
- `codSol`: Código da solicitação
- `numeroAih`: Número da AIH
- `nome`: Nome do paciente
- `cns`: CNS do paciente
- `procedimento`: Descrição do procedimento
- `codProced`: Código do procedimento
- `dataSolicitacao`: Data da solicitação
- `dataInternacao`: Data de internação
- `dataAlta`: Data de alta
- `statusAih`: Status atual da AIH

## ⚡ Performance

### Recomendações
- **Concorrência 6**: Melhor equilíbrio velocidade/estabilidade
- **Timeout 30s**: Adequado para a maioria dos casos
- **Retry 3x**: Suficiente para lidar com instabilidades da rede

### Limitações
- **Rate Limiting**: O servidor pode limitar requisições excessivas
- **Memória**: Operações muito grandes podem esgotar a memória
- **Timeout**: Páginas com muitos dados podem demorar para carregar

## 🤝 Contribuindo

1. **Fork** este repositório
2. **Crie uma branch** para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. **Faça commit** das mudanças (`git commit -am 'Adiciona nova funcionalidade'`)
4. **Push** para a branch (`git push origin feature/nova-funcionalidade`)
5. **Crie um Pull Request**

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para detalhes.

## 🆘 Suporte

- **Issues**: Use o sistema de issues do GitHub
- **Documentação**: Consulte este README
- **Logs**: Sempre verifique o console do navegador (`F12`)

## 🔄 Changelog

### v1.0.0 (2024-09-XX)
- ✅ Lançamento inicial
- ✅ Todas as funcionalidades do cliente original
- ✅ Interface gráfica completa
- ✅ Sistema de configurações
- ✅ Exportação CSV otimizada
- ✅ Suporte a Manifest V3

---

**🏥 SISREG AIH Client Extension** - Facilitando o trabalho com dados hospitalares desde 2024