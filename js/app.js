/**
 * MTG Buying List - 采购清单应用
 * 参考 Deck Builder 风格
 */

// 采购清单数据
let buyingList = [];

// Foil 模式状态 (false = non-foil, true = foil)
let isFoilMode = false;

// 语言模式 ('cn' = 中文优先，'en' = 英文优先)
let langMode = 'cn';

// ========== 图片预加载缓存（移到顶部避免 hoisting 问题）==========
const imageCache = {}; // 缓存已生成的正方形图片 { imageUrl: canvas }
const imageLoading = {}; // 标记正在加载的图片 { imageUrl: true }

// ============ 图片预加载功能 ============

// 预加载卡牌图片（后台生成正方形图）
async function preloadCardImage(imageUrl) {
  console.log('🔄 开始预加载:', imageUrl);
  console.log('📦 缓存状态:', { hasCache: !!imageCache[imageUrl], isLoading: !!imageLoading[imageUrl], cacheKeys: Object.keys(imageCache).length });
  
  // 如果已缓存或正在加载，跳过
  if (imageCache[imageUrl]) {
    console.log('✅ 已有缓存，跳过');
    return;
  }
  if (imageLoading[imageUrl]) {
    console.log('⏳ 正在加载中，跳过');
    return;
  }
  
  imageLoading[imageUrl] = true;
  
  // 显示加载指示器
  setTimeout(() => {
    const indicators = document.querySelectorAll('.image-loading-indicator');
    indicators.forEach(ind => {
      if (ind.dataset.imageUrl === imageUrl) {
        ind.style.display = 'flex';
        console.log('👁️ 显示加载指示器');
      }
    });
  }, 100);
  
  try {
    // 后台生成正方形图片
    const canvas = await renderAndShowCanvas(imageUrl, null, null, true);
    imageCache[imageUrl] = canvas;
    console.log('✅ 图片预加载完成，已缓存:', imageUrl, 'Canvas 尺寸:', canvas.width, 'x', canvas.height);
  } catch (error) {
    console.log('❌ 图片预加载失败:', imageUrl, error);
  } finally {
    imageLoading[imageUrl] = false;
    
    // 隐藏加载指示器
    const indicators = document.querySelectorAll('.image-loading-indicator');
    indicators.forEach(ind => {
      if (ind.dataset.imageUrl === imageUrl) {
        ind.style.display = 'none';
      }
    });
  }
}

// ============ 搜索功能 ============

async function searchCard() {
  const query = document.getElementById('cardInput')?.value.trim();
  if (!query) return;

  const resultsDiv = document.getElementById('searchResults');
  if (!resultsDiv) return;

  resultsDiv.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div>搜索中...</div>
    </div>
  `;

  try {
    const match = parseSetNumber(query);
    if (!match) {
      resultsDiv.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">❌</div>
          <div class="empty-state-text">格式错误<br>请输入如 BIG 36</div>
        </div>
      `;
      return;
    }

    // 先搜索英文版
    const response = await fetch(
      `https://api.scryfall.com/cards/search?q=e:${match.set}+cn:${match.number}&unique=prints`
    );
    const enData = await response.json();

    if (enData.total_cards === 0 || !enData.data || enData.data.length === 0) {
      resultsDiv.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-text">未找到卡牌</div>
        </div>
      `;
      return;
    }

    const enCard = enData.data[0];
    
    // 搜索中文版（通过 oracle_id）
    let cnCard = null;
    if (enCard.oracle_id) {
      try {
        const cnResponse = await fetch(
          `https://api.scryfall.com/cards/search?q=oracle_id:${enCard.oracle_id}+lang:zh`
        );
        const cnData = await cnResponse.json();
        if (cnData.data && cnData.data.length > 0) {
          cnCard = cnData.data[0];
        }
      } catch (e) {
        console.log('中文版搜索失败:', e);
      }
    }

    displaySearchResults(enCard, cnCard);

    // 自动添加到清单
    const autoAdd = document.getElementById('autoAddCheckbox')?.checked;
    if (autoAdd) {
      const nameCn = cnCard?.printed_name || cnCard?.name || '';
      const price = getPriceForMode(enCard, isFoilMode);
      const setCode = (enCard.set || '').toUpperCase(); // 使用系列缩写（如 BIG），转大写
      const cardNumber = enCard.collector_number || '';
      addToBuyingList(enCard.id, enCard.name, nameCn, price, isFoilMode, setCode, cardNumber);
    }

  } catch (error) {
    console.error('搜索失败:', error);
    resultsDiv.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❌</div>
        <div class="empty-state-text">搜索失败</div>
      </div>
    `;
  }
}

// 解析系列 + 编号
function parseSetNumber(query) {
  const match = query.match(/^([A-Za-z0-9]+)[- ]?(\d+)$/);
  if (match) {
    return { set: match[1].toLowerCase(), number: match[2] };
  }
  return null;
}

// 显示搜索结果
function displaySearchResults(enCard, cnCard) {
  const resultsDiv = document.getElementById('searchResults');
  
  const nameEn = escapeHtml(enCard.name);
  const nameCn = escapeHtml(cnCard?.printed_name || cnCard?.name || '');
  const displayType = escapeHtml(enCard.printed_type_line || enCard.type_line);
  const imageUrl = enCard.image_uris?.normal || enCard.image_uris?.small || 'https://cards.scryfall.io/back.jpg';
  const price = getPriceForMode(enCard, isFoilMode);
  const modeLabel = isFoilMode ? '✨ Foil' : '📄 Non-Foil';
  const setName = enCard.set_name || '';
  const setCode = (enCard.set || '').toUpperCase();
  
  // 根据语言模式决定显示的名称
  const displayName = langMode === 'cn' && nameCn ? nameCn : nameEn;
  const subName = langMode === 'cn' && nameCn ? nameEn : nameCn;

  resultsDiv.innerHTML = `
    <div class="card-item">
      <div class="card-image-wrapper">
        <img class="card-image" src="${imageUrl}" alt="${escapeHtml(nameEn)}" loading="lazy" style="cursor: zoom-in;" data-image-url="${imageUrl}" data-name-display="${escapeHtml(displayName)}" data-name-en="${escapeHtml(nameEn)}" data-set-info="${setCode} ${enCard.collector_number || ''}" data-name-cn="${escapeHtml(nameCn || '')}">
        <div class="image-loading-indicator" data-image-url="${imageUrl}">
          <span class="loading-icon">⏳</span>
          <span class="loading-text">大图生成中</span>
        </div>
      </div>
      <div class="card-details">
        <div class="card-name">${displayName}${subName ? `<br><span style="color: var(--text-muted); font-size: 0.875rem;">${subName}</span>` : ''}</div>
        <div class="card-type">${displayType}</div>
        <div class="card-price">${price > 0 ? `$${price.toFixed(2)}` : '暂无价格'}</div>
        <div class="card-mode-label" style="font-size: 0.75rem; color: var(--primary-light); margin-top: 0.25rem;">${modeLabel}</div>
      </div>
      <button class="add-btn" data-card-id="${enCard.id}" data-name-en="${escapeHtml(nameEn)}" data-name-cn="${escapeHtml(nameCn)}" data-price="${price}" data-foil="${isFoilMode}" data-set="${enCard.set || ''}" data-number="${enCard.collector_number || ''}" data-image="${imageUrl}">
        ➕ 添加
      </button>
    </div>
  `;
  
  // 开始预加载这张图片（后台生成）
  preloadCardImage(imageUrl);
  
  // 添加事件监听
  const img = resultsDiv.querySelector('.card-image');
  if (img) {
    img.onclick = function() {
      showCardImage(
        this.dataset.imageUrl,
        this.dataset.nameDisplay,
        this.dataset.nameEn,
        this.dataset.setInfo,
        this.dataset.nameCn || ''
      );
    };
  }
  
  const addBtn = resultsDiv.querySelector('.add-btn');
  if (addBtn) {
    addBtn.onclick = function() {
      addToBuyingList(
        this.dataset.cardId,
        this.dataset.nameEn,
        this.dataset.nameCn,
        parseFloat(this.dataset.price),
        this.dataset.foil === 'true',
        this.dataset.set,
        this.dataset.number,
        this.dataset.image
      );
    };
  }
}

// ============ 采购清单功能 ============

function addToBuyingList(cardId, nameEn, nameCn, price, isFoil = false, setName = '', cardNumber = '') {
  // 检查是否已存在（同 ID + 同 foil 模式）
  const existingIndex = buyingList.findIndex(c => c.id === cardId && (c.is_foil || false) === isFoil);
  if (existingIndex >= 0) {
    buyingList[existingIndex].quantity = (buyingList[existingIndex].quantity || 1) + 1;
    saveList();
    renderList();
    updateStats();
    showToast(`已增加 ${nameEn}`, 'success');
    return;
  }

  // 添加到清单
  buyingList.push({
    id: cardId,
    name_en: nameEn,
    name_cn: nameCn,
    price: price,
    quantity: 1,
    is_foil: isFoil,
    set_code: setName,
    card_number: cardNumber
  });

  saveList();
  renderList();
  updateStats();
  showToast(`已添加到清单 (${isFoil ? '✨ Foil' : '📄 Non-Foil'})`, 'success');
}

function changeQuantity(index, delta) {
  event.stopPropagation();
  if (index >= 0 && index < buyingList.length) {
    buyingList[index].quantity = (buyingList[index].quantity || 1) + delta;
    if (buyingList[index].quantity < 1) {
      buyingList[index].quantity = 1;
    }
    saveList();
    renderList();
    updateStats();
  }
}

function toggleCardLang(index) {
  event.stopPropagation();
  if (index >= 0 && index < buyingList.length) {
    const card = buyingList[index];
    // 切换语言偏好
    card.use_cn = !(card.use_cn !== undefined ? card.use_cn : (langMode === 'cn'));
    saveList();
    renderList();
    const newLang = card.use_cn ? '中文' : 'English';
    showToast(`已切换到 ${newLang}`, 'success');
  }
}

function toggleCardFoil(index) {
  event.stopPropagation();
  if (index >= 0 && index < buyingList.length) {
    const card = buyingList[index];
    // 切换 foil 状态
    card.is_foil = !card.is_foil;
    
    // 重新获取价格（需要重新查询卡牌数据）
    fetch(`https://api.scryfall.com/cards/${card.id}`)
      .then(res => res.json())
      .then(cardData => {
        const newPrice = getPriceForMode(cardData, card.is_foil);
        card.price = newPrice;
        saveList();
        renderList();
        updateStats();
        showToast(`已切换到 ${card.is_foil ? '✨ Foil' : '📄 Non-Foil'}`, 'success');
      })
      .catch(err => {
        console.error('价格更新失败:', err);
        // 即使价格更新失败也切换状态
        saveList();
        renderList();
        updateStats();
        showToast(`已切换到 ${card.is_foil ? '✨ Foil' : '📄 Non-Foil'}`, 'warning');
      });
  }
}

function removeFromList(index) {
  event.stopPropagation();
  if (index >= 0 && index < buyingList.length) {
    const name = buyingList[index].name_en;
    buyingList.splice(index, 1);
    saveList();
    renderList();
    updateStats();
    showToast(`已移除 ${name}`, 'success');
  }
}

function clearList() {
  if (buyingList.length === 0) {
    showToast('清单已经是空的', 'warning');
    return;
  }

  if (confirm('确定要清空采购清单吗？')) {
    buyingList = [];
    saveList();
    renderList();
    updateStats();
    showToast('清单已清空', 'success');
  }
}

function renderList() {
  const listContent = document.getElementById('listContent');

  if (buyingList.length === 0) {
    listContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🛒</div>
        <div class="empty-state-text">暂无卡牌<br>输入系列 + 编号开始添加</div>
      </div>
    `;
    return;
  }

  listContent.innerHTML = buyingList.map((card, index) => {
    const itemTotal = (card.price || 0) * (card.quantity || 1);
    const buylistRate = card.is_foil ? 0.5 : 0.6;
    const buylistValue = itemTotal * buylistRate;
    const foilLabel = card.is_foil ? 'foil' : 'nonfoil';
    const foilIcon = card.is_foil ? '✨' : '📄';
    const foilText = card.is_foil ? 'Foil' : 'Non-Foil';
    const setInfo = card.set_code ? `${(card.set_code || '').toUpperCase()} #${card.card_number || ''}` : '';
    
    // 根据卡牌的语言偏好决定显示的名称（优先使用中文名）
    const useCn = card.use_cn !== undefined ? card.use_cn : (langMode === 'cn');
    const displayName = useCn && card.name_cn ? card.name_cn : card.name_en;
    const subName = useCn && card.name_cn ? card.name_en : card.name_cn;
    // 按钮显示当前显示的语言（点击后切换到另一种）
    const langBtnText = useCn && card.name_cn ? '🇨🇳 CN' : '🇺🇸 EN';
    
    return `
      <div class="deck-card">
        <div class="deck-card-info">
          <div class="deck-card-quantity-row">
            <div class="deck-card-quantity">${card.quantity || 1}</div>
            <div class="deck-card-qty-buttons">
              <button class="deck-card-qty-btn" onclick="window.buyingList.changeQuantity(${index}, -1)">−</button>
              <button class="deck-card-qty-btn" onclick="window.buyingList.changeQuantity(${index}, 1)">+</button>
            </div>
          </div>
          <div class="deck-card-name-wrapper">
            <div class="deck-card-name">${foilIcon} ${escapeHtml(displayName)}${subName ? `<br><span style="color: var(--text-muted); font-size: 0.8125rem;">${escapeHtml(subName)}</span>` : ''}</div>
            ${setInfo ? `<div class="deck-card-set" style="font-size: 0.75rem; color: var(--primary-light); margin-top: 0.25rem;">${escapeHtml(setInfo)}</div>` : ''}
            <div class="deck-card-price">$${card.price > 0 ? card.price.toFixed(2) : '0.00'}</div>
          </div>
        </div>
        <div class="deck-card-actions-wrapper">
          <button class="lang-switch-btn" onclick="window.buyingList.toggleCardLang(${index})" title="切换语言">
            ${langBtnText}
          </button>
          <button class="foil-switch-btn" onclick="window.buyingList.toggleCardFoil(${index})" title="切换版本">
            ${foilText}
          </button>
          <div class="deck-card-foil-label ${foilLabel}" style="min-width: 70px;">$${itemTotal.toFixed(2)}</div>
          <div class="deck-card-buylist-label" style="font-size: 0.625rem; color: var(--warning); font-weight: 700; min-width: 50px; text-align: center;">💰$${buylistValue.toFixed(2)}</div>
          <button class="qty-btn" onclick="window.buyingList.removeFromList(${index})" title="移除">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateStats() {
  const totalCount = document.getElementById('totalCount');
  const totalPrice = document.getElementById('totalPrice');
  const buylistTotal = document.getElementById('buylistTotal');

  const totalQty = buyingList.reduce((sum, card) => sum + (card.quantity || 1), 0);
  totalCount.textContent = totalQty;

  const total = buyingList.reduce((sum, card) => sum + (card.price || 0) * (card.quantity || 1), 0);
  totalPrice.textContent = `$${total.toFixed(2)}`;

  // 计算估算回收价（Non-Foil 60%, Foil 50%）
  const buylistValue = buyingList.reduce((sum, card) => {
    const cardPrice = card.price || 0;
    const qty = card.quantity || 1;
    const rate = card.is_foil ? 0.5 : 0.6; // Foil 50%, Non-Foil 60%
    return sum + (cardPrice * rate * qty);
  }, 0);
  
  if (buylistTotal) {
    buylistTotal.textContent = `$${buylistValue.toFixed(2)}`;
  }
}

function saveList() {
  localStorage.setItem('mtg-buying-list', JSON.stringify(buyingList));
  localStorage.setItem('mtg-buying-list-foil-mode', isFoilMode.toString());
  localStorage.setItem('mtg-buying-list-lang-mode', langMode);
}

function loadList() {
  const saved = localStorage.getItem('mtg-buying-list');
  if (saved) {
    try {
      buyingList = JSON.parse(saved);
      renderList();
      updateStats();
    } catch (e) {
      console.error('加载清单失败:', e);
      buyingList = [];
    }
  }
}

function exportList() {
  if (buyingList.length === 0) {
    showToast('清单是空的', 'warning');
    return;
  }

  // 创建导出菜单
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 420px;">
      <div class="modal-header">
        <h2 class="modal-title">📤 导出清单</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div style="padding: 1rem 0;">
        <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">选择导出格式：</p>
        <button class="export-option-btn" onclick="window.buyingList.exportAsText()">
          📄 文本格式
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">复制到剪贴板</div>
        </button>
        <button class="export-option-btn" onclick="window.buyingList.exportAsCSV()">
          📊 Excel (CSV)
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">下载 .csv 文件</div>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // 点击遮罩关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// 导出为文本（原有功能）
function exportAsText() {
  let text = 'MTG Buying List - 采购清单\n\n';
  text += `生成时间：${new Date().toLocaleString('zh-CN')}\n`;
  text += `卡牌数量：${buyingList.reduce((sum, c) => sum + (c.quantity || 1), 0)}\n\n`;
  text += '='.repeat(50) + '\n\n';

  buyingList.forEach((card, index) => {
    const itemTotal = (card.price || 0) * (card.quantity || 1);
    const buylistValue = itemTotal * (card.is_foil ? 0.5 : 0.6);
    text += `${index + 1}. ${card.name_en}${card.name_cn ? ` (${card.name_cn})` : ''}\n`;
    text += `   版本：${card.is_foil ? '✨ Foil' : '📄 Non-Foil'}\n`;
    text += `   数量：${card.quantity || 1}\n`;
    text += `   单价：$${card.price > 0 ? card.price.toFixed(2) : 'N/A'}\n`;
    text += `   小计：$${itemTotal.toFixed(2)}\n`;
    text += `   估算回收：$${buylistValue.toFixed(2)}\n\n`;
  });

  text += '='.repeat(50) + '\n';
  const total = buyingList.reduce((sum, card) => sum + (card.price || 0) * (card.quantity || 1), 0);
  const buylistTotal = buyingList.reduce((sum, card) => {
    const itemTotal = (card.price || 0) * (card.quantity || 1);
    return sum + (itemTotal * (card.is_foil ? 0.5 : 0.6));
  }, 0);
  text += `预估总价：$${total.toFixed(2)}\n`;
  text += `估算回收总价：$${buylistTotal.toFixed(2)}\n`;
  text += `\n注：回收价估算系数 Non-Foil 60% / Foil 50%\n`;

  copyToClipboard(text).then(() => {
    showToast('清单已复制到剪贴板', 'success');
    // 关闭弹窗
    document.querySelector('.modal-overlay')?.remove();
  });
}

// 导出为 CSV (Excel 可打开)
function exportAsCSV() {
  // CSV 头部 - 12 列（使用英文逗号分隔）
  let csv = '\uFEFF'; // BOM for Excel UTF-8 support
  csv += 'No.,Card Name (EN),Card Name (CN),Set Code,Number,Language,Version,Quantity,Unit Price (USD),Subtotal (USD),Buylist Price (USD),Rate\n';

  buyingList.forEach((card, index) => {
    const itemTotal = (card.price || 0) * (card.quantity || 1);
    const buylistValue = itemTotal * (card.is_foil ? 0.5 : 0.6);
    const rate = card.is_foil ? '50%' : '60%';
    const version = card.is_foil ? 'Foil' : 'Non-Foil';
    const useCn = card.use_cn !== undefined ? card.use_cn : (langMode === 'cn');
    const language = useCn && card.name_cn ? 'CS' : 'EN';
    
    // 处理字段中的逗号和引号
    const nameEn = `"${(card.name_en || '').replace(/"/g, '""')}"`;
    const nameCn = `"${(card.name_cn || '').replace(/"/g, '""')}"`;
    const setCode = `"${(card.set_code || '').toUpperCase().replace(/"/g, '""')}"`;
    const cardNumber = card.card_number || '';
    
    // 12 列：序号，英文名，中文名，系列缩写，编号，语言，版本，数量，单价，小计，回收价，系数
    csv += `${index + 1},${nameEn},${nameCn},${setCode},${cardNumber},${language},${version},${card.quantity || 1},$${card.price > 0 ? card.price.toFixed(2) : '0.00'},$${itemTotal.toFixed(2)},$${buylistValue.toFixed(2)},${rate}\n`;
  });

  // 添加汇总行 - 对齐 11 列
  const totalQty = buyingList.reduce((sum, c) => sum + (c.quantity || 1), 0);
  const total = buyingList.reduce((sum, card) => sum + (card.price || 0) * (card.quantity || 1), 0);
  const buylistTotal = buyingList.reduce((sum, card) => {
    const itemTotal = (card.price || 0) * (card.quantity || 1);
    return sum + (itemTotal * (card.is_foil ? 0.5 : 0.6));
  }, 0);
  
  // 汇总行：对齐 12 列
  // 数据行列结构：No.(1), EN(2), CN(3), Set(4), Number(5), Language(6), Version(7), Qty(8), UnitPrice(9), Subtotal(10), Buylist(11), Rate(12)
  // 汇总行：Summary(1), 空 (2-7), 总数量 (8), 空 (9), 总金额 (10), 总回收价 (11), 空 (12)
  csv += `\nSummary,,,,,,,${totalQty},,$${total.toFixed(2)},$${buylistTotal.toFixed(2)},,\n`;

  // 创建下载
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `MTG_Buying_List_${timestamp}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('CSV 文件已下载，可用 Excel 打开', 'success');
  // 关闭弹窗
  document.querySelector('.modal-overlay')?.remove();
}

// ============ Foil 模式切换 ============

function setFoilMode(isFoil) {
  isFoilMode = isFoil;
  
  // 更新按钮状态
  const nonfoilBtn = document.getElementById('nonfoilBtn');
  const foilBtn = document.getElementById('foilBtn');
  
  if (nonfoilBtn && foilBtn) {
    if (isFoil) {
      nonfoilBtn.classList.remove('active');
      foilBtn.classList.add('active');
    } else {
      nonfoilBtn.classList.add('active');
      foilBtn.classList.remove('active');
    }
  }
  
  // 重新搜索（如果有输入）
  const input = document.getElementById('cardInput');
  if (input && input.value.trim()) {
    searchCard();
  }
}

// ============ 语言模式切换 ============

function setLangMode(mode) {
  langMode = mode;
  
  // 更新按钮状态
  const cnBtn = document.getElementById('cnBtn');
  const enBtn = document.getElementById('enBtn');
  
  if (cnBtn && enBtn) {
    if (mode === 'cn') {
      cnBtn.classList.add('active');
      enBtn.classList.remove('active');
    } else {
      cnBtn.classList.remove('active');
      enBtn.classList.add('active');
    }
  }
  
  // 重新搜索（如果有输入）
  const input = document.getElementById('cardInput');
  if (input && input.value.trim()) {
    searchCard();
  }
  
  // 重新渲染清单
  renderList();
}

// 获取对应版本的价格
function getPriceForMode(card, foil) {
  if (foil) {
    // Foil 模式：优先 usd_foil，回退到 usd
    return parseFloat(card.prices?.usd_foil || card.prices?.usd || '0');
  } else {
    // Non-foil 模式：优先 usd，回退到 usd_foil
    return parseFloat(card.prices?.usd || card.prices?.usd_foil || '0');
  }
}

// ============ 工具函数 ============

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

// ============ 事件绑定 ============

document.addEventListener('DOMContentLoaded', () => {
  // 加载保存的 foil 模式
  const savedFoilMode = localStorage.getItem('mtg-buying-list-foil-mode');
  if (savedFoilMode !== null) {
    isFoilMode = savedFoilMode === 'true';
    // 更新按钮状态
    const nonfoilBtn = document.getElementById('nonfoilBtn');
    const foilBtn = document.getElementById('foilBtn');
    if (nonfoilBtn && foilBtn) {
      if (isFoilMode) {
        nonfoilBtn.classList.remove('active');
        foilBtn.classList.add('active');
      } else {
        nonfoilBtn.classList.add('active');
        foilBtn.classList.remove('active');
      }
    }
  }
  
  // 加载保存的语言模式
  const savedLangMode = localStorage.getItem('mtg-buying-list-lang-mode');
  if (savedLangMode !== null) {
    langMode = savedLangMode;
    // 更新按钮状态
    const cnBtn = document.getElementById('cnBtn');
    const enBtn = document.getElementById('enBtn');
    if (cnBtn && enBtn) {
      if (langMode === 'cn') {
        cnBtn.classList.add('active');
        enBtn.classList.remove('active');
      } else {
        cnBtn.classList.remove('active');
        enBtn.classList.add('active');
      }
    }
  }
  
  loadList();

  const input = document.getElementById('cardInput');
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchCard();
    }
  });
});

// 显示卡牌大图
let currentImageUrl = ''; // 保存当前图片 URL
let currentCanvas = null; // 保存当前 canvas
let currentCardNameCn = ''; // 保存当前卡牌中文名
let currentCardNameEn = ''; // 保存当前卡牌英文名
let currentSetCode = ''; // 保存当前系列缩写
let currentCardNumber = ''; // 保存当前编号

async function showCardImage(imageUrl, nameDisplay, nameEn, setInfo, nameCn = '') {
  const modal = document.getElementById('cardModal');
  const loading = document.getElementById('modalLoading');
  const canvas = document.getElementById('modalCanvas');
  const info = document.getElementById('modalCardInfo');
  const copyInput = document.getElementById('modalCopyInput');
  
  if (modal && loading && canvas && info) {
    currentImageUrl = imageUrl;
    currentCardNameCn = nameCn || nameDisplay;
    currentCardNameEn = nameEn;
    
    // 解析系列和编号 (setInfo 格式："BIG 36")
    const setMatch = (setInfo || '').match(/^([A-Z0-9]+)\s+(\d+)$/i);
    if (setMatch) {
      currentSetCode = setMatch[1].toUpperCase();
      currentCardNumber = setMatch[2];
    } else {
      currentSetCode = '';
      currentCardNumber = '';
    }
    
    modal.style.setProperty('display', 'flex', 'important');
    
    console.log('🔍 检查缓存:', imageUrl);
    console.log('📦 缓存状态:', { hasCache: !!imageCache[imageUrl], cacheKeys: Object.keys(imageCache).length });
    
    // 检查是否已有缓存
    if (imageCache[imageUrl]) {
      // 直接使用缓存的图片
      console.log('✅ 使用缓存图片！');
      loading.style.display = 'none';
      canvas.style.display = 'block';
      canvas.width = imageCache[imageUrl].width;
      canvas.height = imageCache[imageUrl].height;
      
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imageCache[imageUrl], 0, 0);
      
      currentCanvas = imageCache[imageUrl];
      
      // 显示卡牌信息
      info.innerHTML = `<strong>${nameDisplay}</strong><br>${setInfo || nameEn}`;
      
      // 设置复制文本框内容（有中文名才显示，否则只显示英文）
      let copyText = '';
      if (currentCardNameCn && currentCardNameCn.trim() !== '') {
        copyText = `牌客窝 万智牌 ${currentCardNameCn} ${currentCardNameEn}`;
      } else {
        copyText = `牌客窝 万智牌 ${currentCardNameEn}`;
      }
      if (copyInput) {
        copyInput.value = copyText;
      }
      
      canvas.onclick = function() {
        openCanvasInNewTab(currentCanvas);
      };
    } else {
      console.log('⏳ 无缓存，开始生成...');
      // 没有缓存，显示加载动画并生成
      loading.style.display = 'flex';
      canvas.style.display = 'none';
      info.innerHTML = '';
      
      try {
        // 渲染正方形图片
        currentCanvas = await renderAndShowCanvas(imageUrl, canvas, loading);
        
        // 显示卡牌信息
        info.innerHTML = `<strong>${nameDisplay}</strong><br>${setInfo || nameEn}`;
        
        // 设置复制文本框内容（有中文名才显示，否则只显示英文）
        let copyText = '';
        if (currentCardNameCn && currentCardNameCn.trim() !== '') {
          copyText = `牌客窝 万智牌 ${currentCardNameCn} ${currentCardNameEn}`;
        } else {
          copyText = `牌客窝 万智牌 ${currentCardNameEn}`;
        }
        if (copyInput) {
          copyInput.value = copyText;
        }
        
        // 添加点击放大功能
        canvas.onclick = function() {
          openCanvasInNewTab(currentCanvas);
        };
        
      } catch (error) {
        console.error('渲染失败:', error);
        loading.innerHTML = '<div>❌ 生成失败，点击"查看原图"</div>';
      }
    }
  }
}

// 渲染并显示 canvas
async function renderAndShowCanvas(imgUrl, canvas, loading, silent = false) {
  // 多个 CORS 代理，按优先级尝试
  const proxies = [
    'https://api.allorigins.win/raw?url=',      // 国内相对可用
    'https://corsproxy.io/?',                    // 备用
    'https://cors.bridged.top/',                 // 国内备用
    'https://api.codetabs.com/v1/proxy?quest='   // 备用
  ];
  
  let lastError = null;
  
  for (const proxy of proxies) {
    try {
      const renderedCanvas = await renderCardToCanvasWithProxy(imgUrl, proxy);
      
      // 如果不是静默模式，显示 canvas
      if (!silent && canvas && loading) {
        loading.style.display = 'none';
        canvas.style.display = 'block';
        canvas.width = renderedCanvas.width;
        canvas.height = renderedCanvas.height;
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(renderedCanvas, 0, 0);
      }
      
      return renderedCanvas;
      
    } catch (error) {
      lastError = error;
      console.log('代理失败:', proxy);
      continue;
    }
  }
  
  throw new Error('所有代理都失败了');
}

// 在新窗口打开 canvas 图片
function openCanvasInNewTab(canvas) {
  const dataURL = canvas.toDataURL('image/jpeg', 0.95);
  window.open(dataURL, '_blank');
}

// 查看原图
function openOriginalImage() {
  if (currentImageUrl) {
    window.open(currentImageUrl, '_blank');
  }
}



// 在新标签页打开图片
function openImageInNewTab(url) {
  window.open(url, '_blank');
}

// 下载正方形图片
function downloadSquareImage() {
  if (!currentCanvas) {
    showToast('❌ 图片未生成', 'error');
    return;
  }
  
  try {
    // 直接从已显示的 canvas 导出
    const dataURL = currentCanvas.toDataURL('image/jpeg', 0.95);
    const link = document.createElement('a');
    link.href = dataURL;
    
    // 文件名格式：中文名 系列 编号.jpg
    let fileName = '';
    if (currentCardNameCn) {
      fileName = currentCardNameCn.trim();
      if (currentSetCode) fileName += ' ' + currentSetCode;
      if (currentCardNumber) fileName += ' ' + currentCardNumber;
    } else {
      fileName = 'mtg-card';
    }
    
    // 移除文件非法字符
    fileName = fileName.replace(/[/\\?*|<>:"]/g, '').trim();
    
    link.download = `${fileName}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('✅ 已下载：' + fileName, 'success');
  } catch (error) {
    console.error('下载失败:', error);
    showToast('❌ 下载失败', 'error');
  }
}

// 使用指定代理渲染
async function renderCardToCanvasWithProxy(imgUrl, proxy) {
  const proxyUrl = proxy + encodeURIComponent(imgUrl);
  console.log('使用代理:', proxyUrl);
  
  const response = await fetch(proxyUrl, { timeout: 10000 });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const size = 1000;
  
  canvas.width = size;
  canvas.height = size;
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = blobUrl;
    
    img.onload = function() {
      console.log('图片加载成功，尺寸:', img.naturalWidth, 'x', img.naturalHeight);
      
      // 填充白色背景
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);
      
      // 计算居中
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const padding = size * 0.1;
      let drawWidth, drawHeight, offsetX, offsetY;
      
      if (imgAspect > 1) {
        drawWidth = size - padding * 2;
        drawHeight = drawWidth / imgAspect;
        offsetX = padding;
        offsetY = (size - drawHeight) / 2;
      } else {
        drawHeight = size - padding * 2;
        drawWidth = drawHeight * imgAspect;
        offsetX = (size - drawWidth) / 2;
        offsetY = padding;
      }
      
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      console.log('渲染成功');
      
      URL.revokeObjectURL(blobUrl);
      resolve(canvas);
    };
    
    img.onerror = function() {
      console.error('图片加载失败');
      URL.revokeObjectURL(blobUrl);
      reject(new Error('图片加载失败'));
    };
  });
}

// 复制卡牌信息
function copyCardInfo() {
  const copyInput = document.getElementById('modalCopyInput');
  if (copyInput && copyInput.value) {
    copyToClipboard(copyInput.value).then(() => {
      showToast('✅ 已复制到剪贴板', 'success');
    });
  }
}

// 导出到全局
window.buyingList = {
  searchCard,
  addToBuyingList,
  changeQuantity,
  toggleCardLang,
  toggleCardFoil,
  removeFromList,
  clearList,
  exportList,
  exportAsText,
  exportAsCSV,
  showCardImage,
  setFoilMode,
  setLangMode,
  copyCardInfo
};

console.log('✅ MTG Buying List initialized');
