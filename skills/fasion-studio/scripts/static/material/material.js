/**
 * Material tab
 * 模式：list（详细列表）| grid（图标模式）
 * 分页：list 每页 10 张，grid 每页 60 张，滚动加载更多
 * 缓存：已渲染页缓存 + 图片浏览器缓存
 * 暴露：Material.load(items)  Material.selectItem(id)  Material.setMode(mode)
 */

var Material = (function(){
    var allItems = [];
    var selectedId = null;
    var currentMode = 'list'; // 'list' | 'grid'
    var currentTask = '';
    var REVIEW_STATUS = {'-1':'废片', '0':'待定', '1':'好片', '2':'成片'};
    var filterQuality = 0;
    var filterScore   = 0;
    var filterStatus  = '';
    var filterExported = '';   // 'true' | 'false' | ''
    var opQuality = 'gte';
    var opScore   = 'gte';
    var multiMode = false;       // 多选模式
    var selectedIds = new Set(); // 已选 id 集合

    // ---- 分页 ----
    var LIST_PAGE_SIZE = 10;
    var GRID_PAGE_SIZE = 60;
    var listRendered = 0;  // list 已渲染条数
    var gridRendered = 0;  // grid 已渲染条数
    var listObserver = null;
    var gridObserver = null;
    var listLoading = false;
    var gridLoading = false;

    // ---- 缓存 ----
    var _filterCache = null;     // filteredItems 缓存
    var _filterCacheKey = '';
    var exportGroupCache = [];

    function _buildCacheKey(){
        return [filterStatus, filterExported, filterQuality, opQuality, filterScore, opScore].join('|');
    }

    function filteredItems(){
        var key = _buildCacheKey();
        if(_filterCache && _filterCacheKey === key) return _filterCache;

        var result = allItems.filter(function(item){
            if(filterStatus){
                var st = item.status || '待定';
                var match = st === filterStatus || (filterStatus === '好片' && st === '成片');
                if(!match) return false;
            }
            if(filterExported){
                var exp = item.exported === true || item.exported === 'true';
                if(filterExported === 'true' && !exp) return false;
                if(filterExported === 'false' && exp) return false;
            }
            if(filterQuality > 0){
                var q = item.quality;
                var qs = (q && q.total_score != null) ? parseFloat(q.total_score) : -1;
                if(opQuality === 'gte' ? qs < filterQuality : qs >= filterQuality) return false;
            }
            if(filterScore > 0){
                var s = item.score;
                var ss = (s && s.total_score != null) ? parseFloat(s.total_score) : -1;
                if(opScore === 'gte' ? ss < filterScore : ss >= filterScore) return false;
            }
            return true;
        });

        _filterCache = result;
        _filterCacheKey = key;
        return result;
    }

    function _invalidateCache(){
        _filterCache = null;
        _filterCacheKey = '';
    }

    function updateCount(items){
        var el = document.getElementById('toolbarCount');
        if(!el) return;
        el.textContent = items.length + ' / ' + allItems.length;
    }

    // ==================== Mode switch ====================
    function setMode(mode){
        currentMode = mode;
        document.querySelectorAll('.view-mode-btn').forEach(function(b){
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        var layout = document.getElementById('materialsLayout');
        if(layout) layout.dataset.mode = mode;

        if(mode === 'list'){
            document.getElementById('materialsLayout').style.display = 'flex';
            document.getElementById('gridView').style.display = 'none';
        } else {
            document.getElementById('materialsLayout').style.display = 'none';
            document.getElementById('gridView').style.display = 'flex';
            renderGrid();
        }
        localStorage.setItem('photostudio_view_mode', mode);
    }

    // ==================== List mode: image list (分页) ====================
    function renderImgList(){
        _invalidateCache();
        listRendered = 0;
        listLoading = false;
        var list = document.getElementById('imgList');
        var items = filteredItems();
        updateCount(items);
        if(!items.length){ list.innerHTML='<div class="empty">'+(allItems.length?'无匹配素材':'暂无素材')+'</div>'; return; }

        list.innerHTML = '';
        // 创建哨兵
        var sentinel = document.createElement('div');
        sentinel.className = 'page-sentinel';
        sentinel.id = 'listSentinel';
        list.appendChild(sentinel);

        // 设置 IntersectionObserver
        if(listObserver) listObserver.disconnect();
        listObserver = new IntersectionObserver(function(entries){
            if(entries[0].isIntersecting) loadMoreList();
        }, { root: list, rootMargin: '50px' });
        listObserver.observe(sentinel);

        loadMoreList();
    }

    function loadMoreList(){
        if(listLoading) return;
        var items = filteredItems();
        if(listRendered >= items.length) return;

        listLoading = true;
        var sentinel = document.getElementById('listSentinel');
        if(sentinel){
            sentinel.className = 'page-sentinel loading';
            sentinel.textContent = '加载中...';
        }

        var start = listRendered;
        var end = Math.min(start + LIST_PAGE_SIZE, items.length);
        var fragment = document.createDocumentFragment();

        for(var i = start; i < end; i++){
            var item = items[i];
            var div = document.createElement('div');
            div.className = 'img-thumb' + (multiMode ? ' multi-mode' : '') + (selectedIds.has(String(item.id)) ? ' selected' : '');
            div.dataset.id = item.id;
            div.onclick = (function(id){ return function(){ Material._thumbClick(id); }; })(item.id);

            var html = '';
            if(multiMode){
                html += '<span class="thumb-check'+(selectedIds.has(String(item.id))?' checked':'')+'" data-id="'+item.id+'"></span>';
            }
            var preview = item._preview || '';
            if(preview){
                html += '<img class="thumb-img" src="'+preview+'" alt="#'+item.id+'" loading="lazy" ondblclick="Material._openViewer('+item.id+')">';
            } else {
                html += '<div class="thumb-placeholder">?</div>';
            }
            var sk = statusKey(item.status);
            html += '<div class="thumb-id">'+
                '<span class="id-tag s-'+sk+'" data-id="'+item.id+'" onclick="Material._idClick(event,\''+item.id+'\')" ondblclick="Material._idDblClick(event,\''+item.id+'\')">#'+item.id+'</span>'+
            '</div>';
            div.innerHTML = html;
            fragment.appendChild(div);
        }

        // 在哨兵前插入
        var listEl = document.getElementById('imgList');
        if(sentinel && listEl) listEl.insertBefore(fragment, sentinel);
        else if(listEl) listEl.appendChild(fragment);

        listRendered = end;
        listLoading = false;

        // 更新哨兵
        if(sentinel){
            if(listRendered >= items.length){
                sentinel.className = 'page-sentinel end';
                sentinel.textContent = '共 ' + items.length + ' 张';
            } else {
                sentinel.className = 'page-sentinel';
                sentinel.textContent = '';
            }
        }
    }

    function statusKey(s){
        return {成片:'best',好片:'good',待定:'pending',废片:'reject'}[s||'待定']||'pending';
    }

    function selectItem(id){
        if(multiMode){ toggleSelect(id); return; }
        selectedId = id;
        document.querySelectorAll('.img-thumb').forEach(function(el){
            el.classList.toggle('active', el.dataset.id==id);
        });
        var item = allItems.find(function(i){ return i.id==id; });
        if(item) renderDetail(item);
    }

    // 多选模式：切换单个选中
    function toggleSelect(id){
        var sid = String(id);
        if(selectedIds.has(sid)) selectedIds.delete(sid);
        else selectedIds.add(sid);
        updateMultiUI();
        document.querySelectorAll('.img-thumb[data-id="'+id+'"]').forEach(function(el){
            el.classList.toggle('selected', selectedIds.has(sid));
            var ck = el.querySelector('.thumb-check');
            if(ck) ck.classList.toggle('checked', selectedIds.has(sid));
        });
        document.querySelectorAll('.grid-item[data-id="'+id+'"]').forEach(function(el){
            el.classList.toggle('selected', selectedIds.has(sid));
            var ck = el.querySelector('.grid-check');
            if(ck) ck.classList.toggle('checked', selectedIds.has(sid));
        });
    }

    function updateMultiUI(){
        var actions = document.getElementById('multiActions');
        var cnt = document.getElementById('multiCount');
        if(!actions) return;
        var n = selectedIds.size;
        actions.style.display = (multiMode && n > 0) ? 'flex' : 'none';
        if(cnt) cnt.textContent = '已选 ' + n;
    }

    function syncMultiModeDom(){
        document.querySelectorAll('.img-thumb').forEach(function(el){
            var id = String(el.dataset.id || '');
            el.classList.toggle('multi-mode', multiMode);
            el.classList.toggle('selected', selectedIds.has(id));
            var ck = el.querySelector('.thumb-check');
            if(multiMode){
                if(!ck){
                    ck = document.createElement('span');
                    ck.className = 'thumb-check';
                    ck.dataset.id = id;
                    el.insertBefore(ck, el.firstChild);
                }
                ck.classList.toggle('checked', selectedIds.has(id));
            } else if(ck){
                ck.remove();
            }
        });

        document.querySelectorAll('.grid-item').forEach(function(el){
            var id = String(el.dataset.id || '');
            el.classList.toggle('multi-mode', multiMode);
            el.classList.toggle('selected', selectedIds.has(id));
            var ck = el.querySelector('.grid-check');
            if(multiMode){
                if(!ck){
                    ck = document.createElement('span');
                    ck.className = 'grid-check';
                    el.insertBefore(ck, el.firstChild);
                }
                ck.classList.toggle('checked', selectedIds.has(id));
            } else if(ck){
                ck.remove();
            }
        });
    }

    function syncFilteredDom(){
        var visible = new Set(filteredItems().map(function(item){ return String(item.id); }));
        var visibleCount = visible.size;

        document.querySelectorAll('.img-thumb').forEach(function(el){
            var id = String(el.dataset.id || '');
            el.style.display = visible.has(id) ? '' : 'none';
        });
        document.querySelectorAll('.grid-item').forEach(function(el){
            var id = String(el.dataset.id || '');
            el.style.display = visible.has(id) ? '' : 'none';
        });

        var list = document.getElementById('imgList');
        var grid = document.getElementById('gridContainer');
        var hintId = 'filterEmptyHint';
        var hint = document.getElementById(hintId);
        if(visibleCount === 0){
            var parent = currentMode === 'list' ? list : grid;
            if(parent && !hint){
                hint = document.createElement('div');
                hint.id = hintId;
                hint.className = 'empty';
                hint.textContent = allItems.length ? '无匹配素材' : '暂无素材';
                parent.appendChild(hint);
            } else if(hint){
                hint.textContent = allItems.length ? '无匹配素材' : '暂无素材';
            }
        } else if(hint){
            hint.remove();
        }

        updateCount(filteredItems());

        if(selectedId && !visible.has(String(selectedId))){
            selectedId = null;
            var panel = document.getElementById('detailPanel');
            if(panel) panel.innerHTML = '<div class="detail-empty">← 选择左侧图片查看详情</div>';
        }
    }

    // ==================== List mode: detail panel ====================
    function renderDetail(item){
        var panel = document.getElementById('detailPanel');
        var info = item.info || {};
        var q = item.quality;
        var s = item.score;
        var ct = item.content;
        if(q && !q.level) q = null;
        if(!s || typeof s!=='object' || (!s.genre && !s.total_score)) s = null;
        if(!ct || typeof ct!=='object') ct = null;

        panel.innerHTML =
            '<div class="detail-grid">'+
                '<div class="detail-col">'+
                    '<div class="detail-section">'+
                        '<div class="section-title" style="--c:#8aa9c9">基本信息</div>'+
                        infoRows(info)+
                    '</div>'+
                    '<div class="detail-section" style="margin-top:12px">'+
                        '<div class="section-title" style="--c:#a992c9">图片理解</div>'+
                        contentDetail(ct)+
                    '</div>'+
                '</div>'+
                '<div class="detail-col">'+
                    '<div class="detail-section">'+
                        '<div class="section-title" style="--c:#8fc7a0">质量评估</div>'+
                        qualityDetail(q)+
                    '</div>'+
                '</div>'+
                '<div class="detail-col">'+
                    '<div class="detail-section">'+
                        '<div class="section-title" style="--c:#d9b26a">艺术评估</div>'+
                        scoreDetail(s)+
                    '</div>'+
                '</div>'+
            '</div>';
    }

    // ==================== Grid mode (分页) ====================
    var gridSize = 160; // px, default item width

    function renderGrid(){
        _invalidateCache();
        gridRendered = 0;
        gridLoading = false;
        var container = document.getElementById('gridContainer');
        if(!container) return;
        var items = filteredItems();
        updateCount(items);
        if(!items.length){ container.innerHTML='<div class="empty">'+(allItems.length?'无匹配素材':'暂无素材')+'</div>'; return; }

        container.innerHTML = '';

        // 创建哨兵
        var sentinel = document.createElement('div');
        sentinel.className = 'page-sentinel';
        sentinel.id = 'gridSentinel';
        container.appendChild(sentinel);

        // 设置 IntersectionObserver
        if(gridObserver) gridObserver.disconnect();
        gridObserver = new IntersectionObserver(function(entries){
            if(entries[0].isIntersecting) loadMoreGrid();
        }, { root: container, rootMargin: '100px' });
        gridObserver.observe(sentinel);

        loadMoreGrid();
        applyGridSize();
        bindGridDots();
        bindGridZoom();
    }

    function loadMoreGrid(){
        if(gridLoading) return;
        var items = filteredItems();
        if(gridRendered >= items.length) return;

        gridLoading = true;
        var sentinel = document.getElementById('gridSentinel');
        if(sentinel){
            sentinel.className = 'page-sentinel loading';
            sentinel.textContent = '加载中...';
        }

        var start = gridRendered;
        var end = Math.min(start + GRID_PAGE_SIZE, items.length);
        var container = document.getElementById('gridContainer');
        if(!container){ gridLoading = false; return; }

        // 分步逐个渲染，避免阻塞 UI
        var idx = start;
        function renderOne(){
            if(idx >= end){
                // 本批完成
                gridRendered = end;
                gridLoading = false;
                if(sentinel){
                    if(gridRendered >= items.length){
                        sentinel.className = 'page-sentinel end';
                        sentinel.textContent = '共 ' + items.length + ' 张';
                    } else {
                        sentinel.className = 'page-sentinel';
                        sentinel.textContent = '';
                    }
                }
                return;
            }

            var item = items[idx];
            var preview = item._preview || '';
            var q = item.quality;
            var s = item.score;
            var qScore = (q && q.total_score != null) ? q.total_score : '—';
            var sScore = (s && s.total_score != null) ? s.total_score : '—';
            var isSelected = selectedIds.has(String(item.id));
            var sk = statusKey(item.status);
            var checkbox = multiMode ? '<span class="grid-check'+(isSelected?' checked':'')+'"></span>' : '';

            var div = document.createElement('div');
            div.className = 'grid-item' + (multiMode?' multi-mode':'') + (isSelected?' selected':'');
            div.dataset.id = item.id;
            div.onclick = (function(id){ return function(e){ Material._gridClick(id, e); }; })(item.id);

            div.innerHTML =
                checkbox+
                '<div class="grid-img-wrap">'+
                    (preview ? '<img src="'+preview+'" alt="#'+item.id+'" loading="lazy">' : '<div class="grid-img-placeholder">?</div>')+
                    '<div class="grid-dots">'+
                        '<div class="grid-dot" data-dot="info" title="基本信息"></div>'+
                        '<div class="grid-dot" data-dot="content" title="图片理解"></div>'+
                        '<div class="grid-dot" data-dot="quality" title="质量评估"></div>'+
                        '<div class="grid-dot" data-dot="score" title="艺术评估"></div>'+
                    '</div>'+
                '</div>'+
                '<div class="grid-meta">'+
                    '<span class="grid-id"><span class="id-tag s-'+sk+'" data-id="'+item.id+'" onclick="Material._idClick(event,\''+item.id+'\')" ondblclick="Material._idDblClick(event,\''+item.id+'\')">#'+item.id+'</span></span>'+
                    '<span class="grid-score q" title="质量">Q '+qScore+'</span>'+
                    '<span class="grid-score s" title="艺术">A '+sScore+'</span>'+
                '</div>';

            if(sentinel) container.insertBefore(div, sentinel);
            else container.appendChild(div);

            idx++;
            // 用 requestAnimationFrame 让浏览器有机会渲染
            requestAnimationFrame(renderOne);
        }

        renderOne();
    }

    function applyGridSize(){
        var container = document.getElementById('gridContainer');
        if(!container) return;
        container.style.gridTemplateColumns = 'repeat(auto-fill, minmax('+gridSize+'px, 1fr))';
        // 动态设置图片容器最大高度 = gridSize * 1.5，确保缩放时图片完整展示
        container.style.setProperty('--grid-max-h', Math.round(gridSize * 1.5) + 'px');
    }

    // Zoom: Ctrl+wheel or pinch
    function bindGridZoom(){
        var view = document.getElementById('gridView');
        if(!view || view._zoomBound) return;
        view._zoomBound = true;
        view.addEventListener('wheel', function(e){
            if(!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            var delta = e.deltaY > 0 ? -12 : 12;
            gridSize = Math.max(80, Math.min(400, gridSize + delta));
            applyGridSize();
        }, { passive: false });
    }

    // Dot hover → popup
    var _activePopup = null;
    var _hideTimer = null;

    function clearHideTimer(){ if(_hideTimer){ clearTimeout(_hideTimer); _hideTimer = null; } }

    function scheduleHide(delay){
        clearHideTimer();
        _hideTimer = setTimeout(function(){ hideDotPopup(); }, delay || 300);
    }

    function bindGridDots(){
        var container = document.getElementById('gridContainer');
        if(!container || container._dotsBound) return;
        container._dotsBound = true;

        container.addEventListener('mouseover', function(e){
            var dot = e.target.closest('.grid-dot');
            if(!dot) return;
            clearHideTimer();
            var gridItem = dot.closest('.grid-item');
            if(!gridItem) return;
            var id = gridItem.dataset.id;
            var item = allItems.find(function(i){ return i.id==id; });
            if(!item) return;
            showDotPopup(dot, item, dot.dataset.dot);
        });

        container.addEventListener('mouseout', function(e){
            var dot = e.target.closest('.grid-dot');
            if(!dot) return;
            var to = e.relatedTarget;
            if(to && to.closest && to.closest('.dot-popup')) return;
            scheduleHide(300);
        });
    }

    document.addEventListener('mouseover', function(e){
        if(e.target.closest('.dot-popup')) clearHideTimer();
    });
    document.addEventListener('mouseout', function(e){
        if(!e.target.closest('.dot-popup')) return;
        var to = e.relatedTarget;
        if(to && to.closest && to.closest('.dot-popup')) return;
        scheduleHide(200);
    });

    function showDotPopup(dot, item, type){
        hideDotPopup();

        var content = '';
        var pw = (type === 'info') ? 220 : 360;

        if(type === 'info'){
            content = '<div style="--c:#8aa9c9" class="section-title">基本信息</div>'+infoRows(item.info||{});
        } else if(type === 'content'){
            var ct = item.content; if(!ct || typeof ct!=='object') ct = null;
            content = '<div style="--c:#a992c9" class="section-title">图片理解</div>'+contentDetail(ct);
        } else if(type === 'quality'){
            var q = item.quality; if(q && !q.level) q = null;
            content = '<div style="--c:#8fc7a0" class="section-title">质量评估</div>'+qualityDetail(q);
        } else if(type === 'score'){
            var s = item.score; if(!s || typeof s!=='object' || (!s.genre && !s.total_score)) s = null;
            content = '<div style="--c:#d9b26a" class="section-title">艺术评估</div>'+scoreDetail(s);
        }

        var popup = document.createElement('div');
        popup.className = 'dot-popup';
        popup.innerHTML = content;
        popup.style.width = pw + 'px';
        popup.style.visibility = 'hidden';
        document.body.appendChild(popup);
        _activePopup = popup;

        var rect = dot.getBoundingClientRect();
        var ph = popup.offsetHeight;
        popup.style.visibility = '';

        var top = rect.top - ph - 10;
        var left = rect.left - pw/2 + rect.width/2;
        if(top < 8) top = rect.bottom + 10;
        if(left < 8) left = 8;
        if(left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;

        popup.style.top = top + 'px';
        popup.style.left = left + 'px';
    }

    function hideDotPopup(){
        clearHideTimer();
        if(_activePopup){ _activePopup.remove(); _activePopup = null; }
    }

    // ==================== Detail renderers (shared) ====================
    function infoRows(info){
        var r='';
        function row(k,v){ if(v!=null&&v!==''&&v!==undefined) r+='<div class="info-row"><span class="k">'+k+'</span><span class="v">'+v+'</span></div>'; }
        row('文件', info.file_name);
        if(info.width) row('尺寸', info.width+'×'+info.height);
        if(info.file_size_kb) row('大小', info.file_size_kb+'KB');
        row('格式', info.format);
        row('比例', info.aspect_ratio);
        row('模式', info.color_mode);
        row('拍摄', info.capture_time);
        row('相机', info.camera_model);
        row('光圈', info.aperture);
        if(info.iso) row('ISO', ''+info.iso);
        row('快门', info.shutter_speed);
        row('焦距', info.focal_length);
        if(info.gps_latitude) row('GPS', info.gps_latitude+', '+info.gps_longitude);
        row('素材ID', info.material_id);
        row('来源', info.factory_id);
        row('时间', info.created_at);
        row('提示词', info.prompt);
        return r || '<span class="muted-tip">—</span>';
    }

    function contentDetail(ct){
        if(!ct) return '<span class="muted-tip">暂无数据</span>';
        var keys = ['style','lighting','color','composition','elements','mood','technical'];
        var labels = {style:'风格',lighting:'光线',color:'色彩',composition:'构图',elements:'元素',mood:'氛围',technical:'技术'};
        var html = '';
        keys.forEach(function(k){
            var v = ct[k]; if(!v) return;
            var title = labels[k]||k;
            html += '<div class="ct-block"><div class="ct-key">'+title+'</div>';
            if(typeof v === 'object'){
                Object.keys(v).forEach(function(sub){
                    if(!v[sub]) return;
                    html += '<div class="ct-row"><span class="ct-sub">'+sub+'</span><span class="ct-val">'+v[sub]+'</span></div>';
                });
            } else {
                html += '<div class="ct-val-plain">'+v+'</div>';
            }
            html += '</div>';
        });
        if(ct.summary) html += '<div class="card-text" style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">'+ct.summary+'</div>';
        return html || '<span class="muted-tip">—</span>';
    }

    function qualityDetail(q){
        if(!q) return '<span class="muted-tip">暂无数据</span>';
        var html = '<div class="score-header">'+
            '<span class="score-big q">'+(q.total_score||'-')+'</span>'+
            '<span class="score-sub">/10</span>'+
            '<span class="tag '+(q.level||'')+'" style="margin-left:8px">'+(q.level||'')+'</span>'+
            (q.verdict ? '<div class="verdict">'+q.verdict+'</div>' : '')+
        '</div>';
        var dims = q.dimensions || {};
        Object.keys(dims).forEach(function(k){
            var v=dims[k], sc=v.score||0, pct=sc*10, cls=sc>=7?'hi':(sc>=4?'mid':'lo');
            html += '<div class="dim-block">'+
                '<div class="dim-top"><span class="dim-name">'+k+'</span><span class="dim-val '+cls+'">'+sc+'</span></div>'+
                '<div class="dim-bar"><div class="dim-fill '+cls+'" style="width:'+pct+'%"></div></div>'+
                (v.comment?'<div class="dim-comment">'+v.comment+'</div>':'')+
                (v.issue?'<span class="issue-tag">'+v.issue+'</span>':'')+
            '</div>';
        });
        var dl = q.defects||[];
        if(dl.length){
            html += '<div class="defects-title">缺陷</div>';
            dl.forEach(function(d){
                html += '<div class="defect-item"><span class="sev">'+(d.severity||'')+'</span> '+(d.dimension||'')+': '+(d.detail||'')+'</div>';
            });
        }
        if(q.summary) html += '<div class="card-text" style="margin-top:8px;">'+q.summary+'</div>';
        return html;
    }

    function scoreDetail(s){
        if(!s) return '<span class="muted-tip">暂无数据</span>';
        var html = '<div class="score-header">'+
            '<span class="score-big p">'+(s.total_score||'-')+'</span>'+
            '<span class="score-sub"> 分</span>'+
            (s.genre?'<span class="tag genre" style="margin-left:8px">'+s.genre+'</span>':'')+
        '</div>';
        var dims = s.dimension_scores||{};
        Object.keys(dims).forEach(function(k){
            var v=dims[k]; if(typeof v!=='object') return;
            var sc=v.score||0, fs=v.full_score||10, pct=sc/fs*100, cls=pct>=70?'hi':(pct>=40?'mid':'lo');
            html += '<div class="dim-block">'+
                '<div class="dim-top"><span class="dim-name">'+k+'</span><span class="dim-val '+cls+'">'+sc+'/'+fs+'</span></div>'+
                '<div class="dim-bar"><div class="dim-fill '+cls+'" style="width:'+pct+'%"></div></div>'+
                (v.brief||v.comment?'<div class="dim-comment">'+(v.brief||v.comment)+'</div>':'')+
                (v.merit?'<div class="dim-comment text-green">+ '+v.merit+'</div>':'')+
                (v.defect?'<div class="dim-comment" style="color:var(--red)">- '+v.defect+'</div>':'')+
                (v.improvement?'<div class="dim-comment">→ '+v.improvement+'</div>':'')+
            '</div>';
        });
        if(s.summary) html += '<div class="card-text" style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">'+s.summary+'</div>';
        if(s.strengths){ var st=Array.isArray(s.strengths)?s.strengths.join('；'):String(s.strengths); html+='<div class="card-text text-green" style="margin-top:6px;">✦ '+st+'</div>'; }
        if(s.weaknesses){ var wk=Array.isArray(s.weaknesses)?s.weaknesses.join('；'):String(s.weaknesses); html+='<div class="card-text" style="color:var(--amber);margin-top:4px;">⚠ '+wk+'</div>'; }
        return html;
    }

    // ==================== Pane divider drag ====================
    function initDivider(){
        var STORE_KEY = 'photostudio_pane_w';
        var MIN_W = 80, MAX_RATIO = 0.6;
        var imgList = document.getElementById('imgList');
        var divider = document.getElementById('paneDivider');
        if(!imgList || !divider) return;

        var saved = parseInt(localStorage.getItem(STORE_KEY));
        if(saved && saved >= MIN_W) imgList.style.width = saved + 'px';

        var dragging = false, startX = 0, startW = 0;

        divider.addEventListener('mousedown', function(e){
            e.preventDefault();
            dragging = true;
            startX = e.clientX;
            startW = imgList.getBoundingClientRect().width;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', function(e){
            if(!dragging) return;
            var layout = document.querySelector('.materials-layout');
            var maxW = layout ? layout.getBoundingClientRect().width * MAX_RATIO : 600;
            var newW = Math.max(MIN_W, Math.min(maxW, startW + (e.clientX - startX)));
            imgList.style.width = newW + 'px';
        });

        document.addEventListener('mouseup', function(){
            if(!dragging) return;
            dragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            localStorage.setItem(STORE_KEY, parseInt(imgList.style.width));
        });
    }

    // ==================== Public API ====================
    function _thumbClick(id){
        if(multiMode) toggleSelect(id);
        else selectItem(id);
    }
    function _gridClick(id, e){
        if(multiMode) toggleSelect(id);
        else _openViewer(id);
    }

    function _openViewer(id){
        Viewer.open(filteredItems(), id);
    }

    var _idClickTimer = {};
    var CLICK_REVIEW_CYCLE = [0, 1, 2]; // 0待定→1好片→2成片

    function _getReview(item){
        var r = (item && item.review != null && item.review !== '') ? parseInt(item.review) : 0;
        return isNaN(r) ? 0 : r;
    }

    function _idClick(e, id){
        e.stopPropagation();
        e.preventDefault();
        if(_idClickTimer[id]) return;
        _idClickTimer[id] = setTimeout(function(){
            delete _idClickTimer[id];
            var item = allItems.find(function(i){ return String(i.id)===String(id); });
            if(!item){ console.warn('item not found', id); return; }
            var review = _getReview(item);
            var idx = CLICK_REVIEW_CYCLE.indexOf(review);
            var next = CLICK_REVIEW_CYCLE[(idx < 0 ? 0 : (idx+1)) % CLICK_REVIEW_CYCLE.length];
            _saveReview(id, next);
        }, 220);
    }

    function _idDblClick(e, id){
        e.stopPropagation();
        if(_idClickTimer[id]){ clearTimeout(_idClickTimer[id]); delete _idClickTimer[id]; }
        var item = allItems.find(function(i){ return String(i.id)===String(id); });
        if(!item) return;
        var review = _getReview(item);
        var next = (review === -1) ? 0 : -1; // 废片↔待定
        _saveReview(id, next);
    }

    function _saveReview(id, review){
        var item = allItems.find(function(i){ return String(i.id)===String(id); });
        if(!item) return;
        var materialId = item.material_id || id;
        fetch('/api/materials/review', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({material_id: String(materialId), review: review})
        }).then(function(r){ return r.json(); }).then(function(res){
            if(!res.ok) throw new Error(res.error||'failed');
            // 同步更新同一 material 的所有图片状态
            allItems.forEach(function(i){
                if(String(i.material_id) === String(materialId)){
                    i.review = review;
                    i.status = REVIEW_STATUS[String(review)] || '待定';
                }
            });
            allItems.forEach(function(i){
                if(String(i.material_id) === String(materialId)){
                    _refreshIdTag(i.id);
                }
            });
            _showStatusToast(id, REVIEW_STATUS[String(review)] || '待定');
        })['catch'](function(e){ console.error('状态保存失败', e); });
    }

    // ---- 状态提示 toast ----
    var _toastTimer = null;
    var STATUS_COLORS = {
        '成片': {bg:'#8fc7a0', fg:'#0e1810'},
        '好片': {bg:'#d9b26a', fg:'#1c150a'},
        '待定': {bg:'#4a443a', fg:'#d8d0c0'},
        '废片': {bg:'#d08a7c', fg:'#1c0e0a'}
    };

    function _showStatusToast(id, status){
        var tag = document.querySelector('.id-tag[data-id="'+id+'"]');
        if(!tag) return;
        var c = STATUS_COLORS[status] || STATUS_COLORS['待定'];
        var toast = document.createElement('div');
        toast.className = 'status-toast';
        toast.style.cssText = 'position:fixed;z-index:9999;padding:6px 14px;border-radius:6px;'
            + 'font-size:14px;font-weight:700;pointer-events:none;opacity:0;transition:opacity .15s;'
            + 'background:'+c.bg+';color:'+c.fg+';box-shadow:0 4px 16px rgba(0,0,0,.4);'
            + 'white-space:nowrap;';
        toast.textContent = '#'+id+' → '+status;

        document.body.appendChild(toast);
        var rect = tag.getBoundingClientRect();
        var tw = toast.offsetWidth;
        var left = rect.left + rect.width/2 - tw/2;
        if(left < 8) left = 8;
        if(left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
        toast.style.left = left + 'px';
        toast.style.top = (rect.top - 36) + 'px';
        toast.style.opacity = '1';

        if(_toastTimer) clearTimeout(_toastTimer);
        _toastTimer = setTimeout(function(){
            toast.style.opacity = '0';
            setTimeout(function(){ toast.remove(); }, 200);
        }, 1200);
    }

    function _refreshIdTag(id){
        var item = allItems.find(function(i){ return String(i.id)===String(id); });
        if(!item) return;
        var sk = statusKey(item.status);
        document.querySelectorAll('.id-tag[data-id="'+id+'"]').forEach(function(el){
            el.className = 'id-tag s-'+sk;
        });

        _invalidateCache();
        if(filterStatus){
            var st = item.status || '待定';
            var match = st===filterStatus || (filterStatus==='好片' && st==='成片');
            document.querySelectorAll('.img-thumb[data-id="'+id+'"], .grid-item[data-id="'+id+'"]').forEach(function(el){
                el.style.display = match ? '' : 'none';
            });
            if(!match && String(selectedId) === String(id)){
                selectedId = null;
                var panel = document.getElementById('detailPanel');
                if(panel) panel.innerHTML = '<div class="detail-empty">← 选择左侧图片查看详情</div>';
            }
        }
        updateCount(filteredItems());
    }

    function toggleMultiSelect(){
        multiMode = !multiMode;
        var btn = document.getElementById('btnMultiSelect');
        if(btn) btn.classList.toggle('active', multiMode);
        if(!multiMode){
            selectedIds.clear();
        }
        updateMultiUI();
        syncMultiModeDom();
    }

    function clearSelection(){
        selectedIds.clear();
        updateMultiUI();
        syncMultiModeDom();
    }

    function markSelected(){
        if(!selectedIds.size) return;
        var radios = document.querySelectorAll('input[name="markStatus"]');
        radios.forEach(function(r){ r.checked = r.value === '待定'; });
        var overlay = document.getElementById('markOverlay');
        var dialog = document.getElementById('markDialog');
        if(overlay) overlay.style.display = 'block';
        if(dialog) dialog.style.display = 'flex';
    }

    function closeMarkDialog(){
        var overlay = document.getElementById('markOverlay');
        var dialog = document.getElementById('markDialog');
        if(overlay) overlay.style.display = 'none';
        if(dialog) dialog.style.display = 'none';
    }

    function confirmMark(){
        var checked = document.querySelector('input[name="markStatus"]:checked');
        if(!checked) return;
        var status = checked.value;
        var ids = Array.from(selectedIds);
        closeMarkDialog();

        fetch('/api/task/'+encodeURIComponent(currentTask)+'/status', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ids: ids, status: status})
        }).then(function(r){ return r.json(); }).then(function(res){
            if(!res.ok) throw new Error(res.error||'failed');
            ids.forEach(function(id){
                var item = allItems.find(function(i){ return String(i.id)===String(id); });
                if(item) item.status = status;
            });
            clearSelection();
        })['catch'](function(e){ alert('标记失败: '+e.message); });
    }

    function toggleOp(type){
        var btnId = type === 'quality' ? 'opQuality' : 'opScore';
        var btn = document.getElementById(btnId);
        if(!btn) return;
        var isGte = btn.dataset.op === 'gte';
        var newOp = isGte ? 'lt' : 'gte';
        btn.dataset.op = newOp;
        btn.textContent = newOp === 'gte' ? '≥' : '<';
        btn.classList.toggle('op-lt', newOp === 'lt');
        if(type === 'quality') opQuality = newOp;
        else opScore = newOp;
        var selId = type === 'quality' ? 'filterQuality' : 'filterScore';
        var sel = document.getElementById(selId);
        if(sel && sel.value) setFilter(type, sel.value);
    }

    function setFilter(type, val){
        if(type === 'status'){ filterStatus = val || ''; }
        else {
            var v = val ? parseFloat(val) : 0;
            if(type === 'quality') filterQuality = v;
            else if(type === 'score') filterScore = v;
        }
        _invalidateCache();
        syncFilteredDom();
    }

    // ---- 状态下拉 ----
    var STATUS_DOT_CLASS = {'':'sd-all','成片':'sd-best','好片':'sd-good','待定':'sd-pending','废片':'sd-reject'};

    function _toggleStatusDropdown(e){
        e.stopPropagation();
        var menu = document.getElementById('statusDropdownMenu');
        if(menu) menu.classList.toggle('open');
    }

    function _pickStatus(e, val){
        e.stopPropagation();
        var menu = document.getElementById('statusDropdownMenu');
        if(menu) menu.classList.remove('open');
        // 更新按钮显示
        var btn = document.querySelector('.status-dropdown-btn');
        if(btn){
            var dot = btn.querySelector('.sd-dot');
            var txt = btn.querySelector('.sd-text');
            if(dot) dot.className = 'sd-dot ' + (STATUS_DOT_CLASS[val] || 'sd-all');
            if(txt) txt.textContent = val || '全部';
        }
        // 更新 active
        document.querySelectorAll('.sd-option').forEach(function(opt){
            opt.classList.toggle('active', opt.dataset.value === val);
        });
        setFilter('status', val);
    }

    // 点击外部关闭下拉
    document.addEventListener('click', function(){
        var menu = document.getElementById('statusDropdownMenu');
        if(menu) menu.classList.remove('open');
        var emenu = document.getElementById('exportDropdownMenu');
        if(emenu) emenu.classList.remove('open');
    });

    function _toggleExportDropdown(e){
        e.stopPropagation();
        var menu = document.getElementById('exportDropdownMenu');
        if(menu) menu.classList.toggle('open');
    }

    function _pickExport(e, val){
        e.stopPropagation();
        var menu = document.getElementById('exportDropdownMenu');
        if(menu) menu.classList.remove('open');
        var btn = document.querySelector('#exportDropdown .status-dropdown-btn');
        if(btn){
            var dot = btn.querySelector('.sd-dot');
            var txt = btn.querySelector('.sd-text');
            if(dot) dot.className = 'sd-dot ' + (val === 'true' ? 'sd-best' : (val === 'false' ? 'sd-pending' : 'sd-all'));
            if(txt) txt.textContent = val === 'true' ? '已导出' : (val === 'false' ? '未导出' : '全部');
        }
        document.querySelectorAll('#exportDropdownMenu .sd-option').forEach(function(opt){
            opt.classList.toggle('active', opt.dataset.value === val);
        });
        filterExported = val || '';
        _invalidateCache();
        syncFilteredDom();
    }

    function loadSucceed(taskName){
        currentTask = taskName || '';
        fetch('/api/materials/succeed').then(function(r){ return r.json(); }).then(function(data){
            var flat = [];
            (data.items || []).forEach(function(m){
                var urls = m.urls || [];
                var review = (m.review != null && m.review !== '') ? parseInt(m.review) : 0;
                if(isNaN(review)) review = 0;
                urls.forEach(function(url, idx){
                    var id = urls.length > 1 ? (m.material_id + '_' + idx) : m.material_id;
                    flat.push({
                        id: id,
                        material_id: m.material_id,
                        review: review,
                        status: REVIEW_STATUS[String(review)] || '待定',
                        _preview: '/api/plan/image?url=' + encodeURIComponent(url),
                        url: url,
                        factory_id: m.factory_id,
                        prompt: m.prompt,
                        created_at: m.created_at,
                        info: {
                            file_name: m.material_id,
                            material_id: m.material_id,
                            factory_id: m.factory_id,
                            created_at: m.created_at,
                            prompt: m.prompt,
                        }
                    });
                });
            });
            load(flat, taskName);
        })['catch'](function(e){
            var list = document.getElementById('imgList');
            if(list) list.innerHTML = '<div class="empty">加载失败: '+e.message+'</div>';
        });
    }

    function load(items, taskName){
        allItems = items;
        currentTask = taskName || '';
        _invalidateCache();
        // reset filters & multi-select
        filterQuality = 0; filterScore = 0; filterStatus = ''; filterExported = '';
        opQuality = 'gte'; opScore = 'gte';
        multiMode = false; selectedIds.clear();
        var btnMS = document.getElementById('btnMultiSelect');
        if(btnMS) btnMS.classList.remove('active');
        updateMultiUI();
        var fst = document.getElementById('filterStatus');
        var fq = document.getElementById('filterQuality');
        var fs = document.getElementById('filterScore');
        if(fst) fst.value = '';
        if(fq) fq.value = '';
        if(fs) fs.value = '';
        // 重置状态下拉
        var sdBtn = document.querySelector('#statusDropdown .status-dropdown-btn');
        if(sdBtn){
            var dot = sdBtn.querySelector('.sd-dot');
            var txt = sdBtn.querySelector('.sd-text');
            if(dot) dot.className = 'sd-dot sd-all';
            if(txt) txt.textContent = '全部';
        }
        // 重置导出下拉
        var exBtn = document.querySelector('#exportDropdown .status-dropdown-btn');
        if(exBtn){
            var exDot = exBtn.querySelector('.sd-dot');
            var exTxt = exBtn.querySelector('.sd-text');
            if(exDot) exDot.className = 'sd-dot sd-all';
            if(exTxt) exTxt.textContent = '全部';
        }
        var oq = document.getElementById('opQuality');
        var os = document.getElementById('opScore');
        if(oq){ oq.dataset.op='gte'; oq.textContent='≥'; oq.classList.remove('op-lt'); }
        if(os){ os.dataset.op='gte'; os.textContent='≥'; os.classList.remove('op-lt'); }

        renderImgList();
        initDivider();
        if(allItems.length) selectItem(allItems[0].id);

        // restore saved mode
        var saved = localStorage.getItem('photostudio_view_mode') || 'list';
        setMode(saved);
        syncFilteredDom();
    }

    // ==================== Export dialog ====================
    function exportSelected(){
        if(!selectedIds.size) return;
        document.getElementById('exportOverlay').style.display = 'block';
        document.getElementById('exportDialog').style.display = 'flex';
        fetch('/api/task/'+encodeURIComponent(currentTask)+'/export-next')
            .then(function(r){ return r.json(); })
            .then(function(data){
                document.getElementById('exportFolder').value = data.next || (currentTask + '_01');
                _updateExportPreview();
            })['catch'](function(){
                document.getElementById('exportFolder').value = currentTask + '_01';
                _updateExportPreview();
            });
        loadExportGroups();
    }

    function loadExportGroups(){
        var list = document.getElementById('exportGroupList');
        if(!list) return;
        list.innerHTML = '<div class="export-group-empty">正在加载分组…</div>';
        fetch('/api/task/'+encodeURIComponent(currentTask)+'/exports')
            .then(function(r){ return r.json(); })
            .then(function(data){
                exportGroupCache = (data && data.exports) ? data.exports : [];
                renderExportGroups();
            })['catch'](function(){
                exportGroupCache = [];
                renderExportGroups();
            });
    }

    function renderExportGroups(){
        var list = document.getElementById('exportGroupList');
        if(!list) return;
        if(!exportGroupCache.length){
            list.innerHTML = '<div class="export-group-empty">暂无导出分组，输入新文件夹名即可</div>';
            return;
        }
        var selected = document.getElementById('exportFolder') ? document.getElementById('exportFolder').value.trim() : '';
        list.innerHTML = exportGroupCache.map(function(group){
            var active = String(group.name) === String(selected) ? ' active' : '';
            return '<div class="export-group-item'+active+'" data-name="'+group.name+'" onclick="Material.pickExportGroup(\''+group.name+'\')">'
                + '<span class="egi-name">'+group.name+'</span>'
                + '<span class="egi-count">'+(group.count || 0)+' 张</span>'
                + '</div>';
        }).join('');
    }

    function pickExportGroup(name){
        var input = document.getElementById('exportFolder');
        if(input) input.value = name;
        _updateExportPreview();
        renderExportGroups();
    }

    function _updateExportPreview(){
        var folder = document.getElementById('exportFolder').value || currentTask;
        var exists = exportGroupCache.find(function(g){ return String(g.name) === String(folder); });
        var mode = exists ? '追加到已有分组' : '新建分组';
        document.getElementById('exportPreview').textContent = '将导出到: export/' + folder + '/ (source + compressed) · ' + mode;
        renderExportGroups();
    }

    function confirmExport(){
        var folder = document.getElementById('exportFolder').value.trim();
        if(!folder){ alert('请输入文件夹名'); return; }
        var ids = Array.from(selectedIds);
        // 将选中的 item.id 映射为 material_id 并去重（item.id 可能带 _idx 后缀）
        var materialIds = [];
        ids.forEach(function(id){
            var item = allItems.find(function(i){ return String(i.id) === String(id); });
            var mid = item ? String(item.material_id || id) : String(id);
            if(materialIds.indexOf(mid) < 0) materialIds.push(mid);
        });
        closeExportDialog();

        fetch('/api/materials/export', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({task_name: currentTask, material_ids: materialIds, folder: folder})
        }).then(function(r){ return r.json(); }).then(function(res){
            if(!res.ok) throw new Error(res.error||'export failed');
            alert('已导出 ' + res.copied + ' 张图片到 export/' + folder + '/');
            clearSelection();
        })['catch'](function(e){ alert('导出失败: ' + e.message); });
    }

    function closeExportDialog(){
        document.getElementById('exportOverlay').style.display = 'none';
        document.getElementById('exportDialog').style.display = 'none';
    }

    return {
        load: load,
        loadSucceed: loadSucceed,
        selectItem: selectItem,
        setMode: setMode,
        setFilter: setFilter,
        toggleOp: toggleOp,
        toggleMultiSelect: toggleMultiSelect,
        clearSelection: clearSelection,
        markSelected: markSelected,
        closeMarkDialog: closeMarkDialog,
        confirmMark: confirmMark,
        exportSelected: exportSelected,
        closeExportDialog: closeExportDialog,
        confirmExport: confirmExport,
        _updateExportPreview: _updateExportPreview,
        pickExportGroup: pickExportGroup,
        _thumbClick: _thumbClick,
        _gridClick: _gridClick,
        _idClick: _idClick,
        _idDblClick: _idDblClick,
        _toggleStatusDropdown: _toggleStatusDropdown,
        _pickStatus: _pickStatus,
        _toggleExportDropdown: _toggleExportDropdown,
        _pickExport: _pickExport,
        _openViewer: _openViewer,
        _currentTask: function(){ return currentTask; },
        _refreshItemStatus: _refreshIdTag
    };
})();
