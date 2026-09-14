/**
 * Exhibition Gallery — 导出分组 + 画廊展示
 */
var Gallery = (function(){
    var allItems = [];
    var exportedItems = [];
    var exportGroups = [];
    var currentTask = '';
    var activeGroup = '';
    var zEl, zImg, zInfo, zFrame, zIdx = -1;

    function load(items, name){
        allItems = items || [];
        currentTask = name || '';
        exportedItems = allItems.filter(function(i){ return i.exported===true || i.exported==='true'; });
        fetchExportGroups();

        if(!zEl){
            var el = document.createElement('div');
            el.id = 'galleryZoom';
            el.className = 'gallery-zoom';
            el.innerHTML = '<span class="gallery-zoom-close">&times;</span><span class="gallery-zoom-nav prev" onclick="Gallery.prev(event)">‹</span><div class="gallery-zoom-frame"><img src="" alt=""></div><span class="gallery-zoom-nav next" onclick="Gallery.next(event)">›</span><div class="gallery-zoom-info"></div>';
            el.onclick = function(e){ if(e.target===el) closeZ(); };
            document.body.appendChild(el);
            zEl = el;
            zImg = el.querySelector('img');
            zInfo = el.querySelector('.gallery-zoom-info');
            zFrame = el.querySelector('.gallery-zoom-frame');
        }
    }

    function fetchExportGroups(){
        if(!currentTask) return render();
        fetch('/api/task/' + encodeURIComponent(currentTask) + '/exports')
            .then(function(r){ return r.json(); })
            .then(function(data){
                exportGroups = (data && data.exports) ? data.exports : [];
                renderGroups();
                render();
            })
            .catch(function(){
                exportGroups = [];
                renderGroups();
                render();
            });
    }

    function renderGroups(){
        var el = document.getElementById('expoList');
        if(!el) return;
        if(!exportGroups.length){
            el.innerHTML = '<div class="gallery-expo-empty" style="min-height:120px">暂无导出分组</div>';
            return;
        }

        var html = '<div class="expo-scroll">';
        html += exportGroups.map(function(group){
            var active = String(group.name) === String(activeGroup) ? ' active' : '';
            var cover = findCoverItem(group.cover_id);
            var src = cover ? (cover._preview || '') : '';
            var coverText = cover ? ('#' + cover.id) : 'No Cover';
            return ''
                + '<div class="expo-card' + active + '" data-name="' + group.name + '" onclick="Gallery.pickGroup(\'' + group.name + '\')">'
                +   '<div class="expo-card-cover">'
                +     (src ? '<img src="' + src + '" alt="' + group.name + '" loading="lazy">' : '<div class="expo-card-cover-empty">' + coverText + '</div>')
                +   '</div>'
                +   '<div class="expo-card-meta">'
                +     '<div class="expo-card-name">' + group.name + '</div>'
                +     '<div class="expo-card-count">' + group.count + ' 张</div>'
                +   '</div>'
                + '</div>';
        }).join('');
        html += '</div>';
        el.innerHTML = html;
        el.onscroll = updateNavState;

        if(!activeGroup && exportGroups.length){
            activeGroup = exportGroups[0].name;
        }
        markActiveGroup();
        updateNavState();
        setTimeout(updateNavState, 80);
    }

    function scrollGroups(direction){
        var list = document.getElementById('expoList');
        if(!list) return;
        var card = list.querySelector('.expo-card');
        var step = card ? (card.getBoundingClientRect().width + 14) : 240;
        list.scrollBy({ left: direction * step, behavior: 'smooth' });
        setTimeout(updateNavState, 260);
    }

    function updateNavState(){
        var list = document.getElementById('expoList');
        var leftBtn = document.querySelector('.expo-nav-left');
        var rightBtn = document.querySelector('.expo-nav-right');
        if(!list || !leftBtn || !rightBtn) return;
        var max = Math.max(0, list.scrollWidth - list.clientWidth - 2);
        leftBtn.disabled = list.scrollLeft <= 2;
        rightBtn.disabled = list.scrollLeft >= max;
    }

    function markActiveGroup(){
        document.querySelectorAll('.expo-card').forEach(function(card){
            card.classList.toggle('active', card.dataset.name === activeGroup);
        });
    }

    function pickGroup(name){
        activeGroup = name;
        markActiveGroup();
        render();
    }

    function findCoverItem(coverId){
        if(coverId == null) return null;
        return allItems.find(function(i){ return String(i.id) === String(coverId); }) || null;
    }

    function getVisibleItems(){
        if(!activeGroup) return exportedItems;
        var group = exportGroups.find(function(g){ return String(g.name) === String(activeGroup); });
        if(!group) return [];
        if(!group.ids || !group.ids.length) return [];
        var ids = new Set(group.ids.map(function(v){ return String(v); }));
        return allItems.filter(function(item){ return ids.has(String(item.id)); });
    }

    function render(){
        var wall = document.getElementById('galleryWall');
        if(!wall) return;
        wall.className = 'gallery-expo';

        var visibleItems = getVisibleItems();
        if(!visibleItems.length){
            wall.innerHTML = '<div class="gallery-expo-empty"><div style="font-size:48px;opacity:.1">◈</div><div>相册暂无照片</div><div style="font-size:12px;opacity:.25">在素材页面导出照片后，将在此展示</div></div>';
            return;
        }

        var title = activeGroup ? activeGroup : currentTask;
        var html = '<div class="gallery-expo-header"><h3>✦ ' + title + ' ✦</h3><p>' + visibleItems.length + ' 幅作品</p></div>';
        var perRow = 4;
        for(var r = 0; r < visibleItems.length; r += perRow){
            html += '<div class="gallery-row">';
            var chunk = visibleItems.slice(r, r + perRow);
            chunk.forEach(function(item){ html += buildCard(item, ''); });
            html += '</div>';
            if(r + perRow < visibleItems.length){
                html += '<div class="gallery-divider">✦</div>';
            }
        }

        wall.innerHTML = html;

        wall.querySelectorAll('img').forEach(function(img){
            img.style.opacity = '0';
            img.style.transition = 'opacity .5s';
            img.onload = function(){ img.style.opacity = '1'; };
            if(img.complete) img.style.opacity = '1';
        });
    }

    function buildCard(item){
        var src = item._preview || '';
        var file = item.info ? item.info.file_name : '';
        return '<div class="gallery-piece" data-id="' + item.id + '" onclick="Gallery.zoom(event,' + item.id + ')">'
            + '<div class="gallery-piece-frame"><div class="gallery-piece-mat">'
            + (src ? '<img src="' + src + '" alt="#' + item.id + '" loading="lazy">' : '<div style="width:200px;height:150px;background:#1e1a15;display:flex;align-items:center;justify-content:center;color:#4a443a">#</div>')
            + '</div></div>'
            + '<div class="gallery-piece-info"><div class="id">#' + item.id + '</div><div class="name">' + file + '</div></div>'
            + '</div>';
    }

    function zoom(e, id){
        e.stopPropagation();
        var visibleItems = getVisibleItems();
        var item = visibleItems.find(function(i){ return String(i.id) === String(id); });
        if(!item || !item._preview) return;
        zIdx = visibleItems.indexOf(item);
        renderZ(visibleItems);
        zEl.classList.add('show');
    }
    function renderZ(visibleItems){
        var item = visibleItems[zIdx];
        if(!item) return;
        zImg.src = item._preview || '';
        zInfo.textContent = '#' + item.id + '  ' + (item.info ? item.info.file_name : '') + '  (' + (zIdx + 1) + '/' + visibleItems.length + ')';
        zFrame.style.animation = 'none';
        zFrame.offsetHeight;
        zFrame.style.animation = 'gzFrame .4s cubic-bezier(.22,.61,.36,1)';
    }
    function prev(e){
        if(e) e.stopPropagation();
        var visibleItems = getVisibleItems();
        zIdx = zIdx <= 0 ? visibleItems.length - 1 : zIdx - 1;
        renderZ(visibleItems);
    }
    function next(e){
        if(e) e.stopPropagation();
        var visibleItems = getVisibleItems();
        zIdx = zIdx >= visibleItems.length - 1 ? 0 : zIdx + 1;
        renderZ(visibleItems);
    }
    function closeZ(e){
        if(e && e.target !== zEl && e.target.className !== 'gallery-zoom-close') return;
        zEl && zEl.classList.remove('show');
        zIdx = -1;
    }

    var zoomLevel = 1;
    document.addEventListener('wheel', function(e){
        var tab = document.getElementById('tab-exhibition');
        if(!tab || !tab.classList.contains('active')) return;
        if(!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        zoomLevel = Math.max(0.4, Math.min(3, zoomLevel - e.deltaY * 0.002));
        var wall = document.getElementById('galleryWall');
        if(wall) wall.style.setProperty('--zoom', zoomLevel);
    }, {passive:false});

    document.addEventListener('keydown', function(e){
        if(!zEl || !zEl.classList.contains('show')) return;
        if(e.key === 'Escape') closeZ();
        else if(e.key === 'ArrowLeft') prev();
        else if(e.key === 'ArrowRight') next();
    });

    return { load:load, zoom:zoom, prev:prev, next:next, closeZoom:closeZ, pickGroup:pickGroup, scrollGroups:scrollGroups };
})();
