// ==================== Fullscreen Viewer (shared) ====================
var Viewer = (function(){
    var items = [];
    var index = 0;
    var el, img, info, idTag;
    var SK = {'成片':'best','好片':'good','待定':'pending','废片':'reject'};

    function init(){
        el = document.getElementById('viewer');
        img = document.getElementById('viewerImg');
        info = document.getElementById('viewerInfo');
        idTag = document.getElementById('viewerIdTag');
        document.addEventListener('keydown', function(e){
            if(!el.classList.contains('show')) return;
            if(e.key==='Escape') close();
            else if(e.key==='ArrowLeft') prev(e);
            else if(e.key==='ArrowRight') next(e);
        });
    }

    function open(list, startId){
        items = list;
        index = items.findIndex(function(i){ return String(i.id)===String(startId); });
        if(index < 0) index = 0;
        el.classList.add('show');
        render();
    }

    function close(){
        el.classList.remove('show');
        img.src = '';
    }

    function render(){
        var item = items[index];
        if(!item) return;
        var src = item._preview || '';
        if(src) img.src = src;
        info.textContent = (index+1) + ' / ' + items.length;
        var st = item.status || '待定';
        var sk = SK[st] || 'pending';
        idTag.className = 'viewer-id s-'+sk;
        idTag.textContent = '#'+item.id+' '+st;
        idTag.onclick = function(e){ e.stopPropagation(); cycleStatus(); };
        idTag.ondblclick = function(e){ e.stopPropagation(); dblCycleStatus(); };
    }

    function cycleStatus(){
        var item = items[index];
        if(!item) return;
        var CYCLE = ['待定','好片','成片'];
        var cur = item.status || '待定';
        var idx = CYCLE.indexOf(cur);
        var next = CYCLE[(idx < 0 ? 0 : (idx+1)) % CYCLE.length];
        saveStatus(item.id, next);
    }

    function dblCycleStatus(){
        var item = items[index];
        if(!item) return;
        var cur = item.status || '待定';
        var next = (cur === '废片') ? '待定' : '废片';
        saveStatus(item.id, next);
    }

    function updateCurrentTag(){
        var item = items[index];
        if(!item) return;
        var st = item.status || '待定';
        var sk = SK[st] || 'pending';
        idTag.className = 'viewer-id s-'+sk;
        idTag.textContent = '#'+item.id+' '+st;
    }

    function saveStatus(id, status){
        fetch('/api/task/'+encodeURIComponent(Material._currentTask())+'/status', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ids:[String(id)], status:status})
        }).then(function(r){ return r.json(); }).then(function(res){
            if(!res.ok) throw new Error(res.error||'failed');
            var item = items.find(function(i){ return String(i.id)===String(id); });
            if(item) item.status = status;
            Material._refreshItemStatus(id);
            updateCurrentTag();
        })['catch'](function(e){ console.error('状态保存失败', e); });
    }

    function prev(e){
        if(e) e.stopPropagation();
        index = (index - 1 + items.length) % items.length;
        render();
    }

    function next(e){
        if(e) e.stopPropagation();
        index = (index + 1) % items.length;
        render();
    }

    return { init: init, open: open, close: close, prev: prev, next: next };
})();
