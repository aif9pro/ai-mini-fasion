// ==================== Overview (Mood Docs) Module ====================
// 概览 Tab：展示任务 mood 目录下的四份文档（需求/规划/设计/检查）
var Overview = (function () {
    var DOC_KEYS = ['intent', 'plan', 'design', 'validation'];
    var CREATIVE_KEYS = ['role', 'board'];

    function switchDoc(key) {
        if (DOC_KEYS.indexOf(key) < 0) return;
        document.querySelectorAll('.overview-subtab').forEach(function (b) {
            b.classList.toggle('active', b.dataset.doc === key);
        });
        document.querySelectorAll('.overview-doc').forEach(function (p) {
            p.classList.toggle('active', p.id === 'overview-' + key);
        });
    }

    function switchCreative(key) {
        if (CREATIVE_KEYS.indexOf(key) < 0) return;
        document.querySelectorAll('.creative-tab').forEach(function (b) {
            b.classList.toggle('active', b.dataset.creative === key);
        });
        document.querySelectorAll('.creative-view').forEach(function (p) {
            p.classList.toggle('active', p.id === 'creative-' + key);
        });
    }

    function load(taskName) {
        CREATIVE_KEYS.forEach(function (k) {
            var el = document.getElementById('creative-' + k);
            if (el) el.innerHTML = '<div class="home-placeholder"><div class="spinner"></div>加载中</div>';
        });
        DOC_KEYS.forEach(function (k) {
            var el = document.getElementById('overview-' + k);
            if (el) el.innerHTML = '<div class="home-placeholder"><div class="spinner"></div>加载中</div>';
        });

        fetch('/api/task/' + encodeURIComponent(taskName) + '/mood-docs').then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (data) {
            DOC_KEYS.forEach(function (k) {
                var el = document.getElementById('overview-' + k);
                if (!el) return;
                var md = (data.docs && data.docs[k]) || '';
                el.innerHTML = md
                    ? renderMarkdown(md)
                    : '<div class="home-placeholder">暂无内容</div>';
            });
        }).catch(function () {
            DOC_KEYS.forEach(function (k) {
                var el = document.getElementById('overview-' + k);
                if (el) el.innerHTML = '<div class="home-placeholder">未找到策划文档</div>';
            });
        });

        fetch('/api/task/' + encodeURIComponent(taskName) + '/creative-data').then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (data) {
            renderRole(data.role);
            renderBoard(data.board);
        }).catch(function () {
            renderRole(null, '未找到 role.json');
            renderBoard(null, '未找到 board.json');
        });
    }

    function formatValue(value) {
        if (value === null || value === undefined || value === '') return '—';
        if (Array.isArray(value)) return value.map(function (item) { return formatValue(item); }).join('、');
        if (typeof value === 'object') return Object.keys(value).map(function (key) {
            return '<div class="creative-field"><span>' + escapeHtml(key) + '</span><strong>' + formatValue(value[key]) + '</strong></div>';
        }).join('');
        return escapeHtml(String(value));
    }

    function renderRole(data, emptyText) {
        var el = document.getElementById('creative-role');
        if (!el) return;
        if (!data) { el.innerHTML = '<div class="home-placeholder">' + (emptyText || '暂无角色设定') + '</div>'; return; }
        var role = data.role || data;
        var title = role.name || '角色设定';
        el.innerHTML = '<div class="creative-heading"><span>CHARACTER PROFILE</span><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(role.identity || role.type || '') + '</p></div>' +
            '<div class="creative-card role-summary">' + formatValue({年龄: role.age_range || role.age_stage, 性别表达: role.gender_expression, 故事: role.story}) + '</div>' +
            '<div class="creative-section"><h3>外观与造型</h3><div class="creative-card">' + formatValue({外观: role.appearance, 造型: role.styling, 行为: role.behavior}) + '</div></div>';
    }

    function renderBoard(data, emptyText) {
        var el = document.getElementById('creative-board');
        if (!el) return;
        var shots = data && (data.shots || data.board || data);
        if (!Array.isArray(shots) || !shots.length) { el.innerHTML = '<div class="home-placeholder">' + (emptyText || '暂无分镜内容') + '</div>'; return; }
        el.innerHTML = '<div class="creative-heading"><span>SHOT LIST</span><h2>分镜清单</h2><p>' + shots.length + ' 个镜头 · 统一角色视觉</p></div><div class="board-list">' + shots.map(function (shot, index) {
            var label = shot.shot_scale_zh || shot.shot_scale || ('镜头 ' + (index + 1));
            return '<article class="board-item"><div class="board-index">' + String(index + 1).padStart(2, '0') + '</div><div class="board-main"><div class="board-title"><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(shot.shot_id || '') + '</span></div><p>' + escapeHtml(shot.visual_focus || shot.composition || shot.prompt_zh || '') + '</p><details><summary>查看提示词</summary><div class="board-prompt">' + escapeHtml(shot.prompt_zh || shot.prompt || '') + '</div></details><div class="board-actions"><button class="board-generate-btn" type="button">生成</button></div></div></article>';
        }).join('') + '</div>';
    }

    // ---- 轻量 Markdown 渲染（无外部依赖） ----
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function inlineMd(s) {
        s = escapeHtml(s);
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        return s;
    }

    function isTableSep(row) {
        var s = row.replace(/\|/g, '').trim();
        return s.length > 0 && /^[\s:\-]+$/.test(s);
    }

    function parseTableRow(row) {
        var s = row.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
        return s.split('|').map(function (c) { return c.trim(); });
    }

    function renderTable(rows) {
        if (!rows.length) return '';
        var header = parseTableRow(rows[0]);
        var bodyStart = 1;
        if (rows.length > 1 && isTableSep(rows[1])) bodyStart = 2;

        var html = '<table><thead><tr>';
        header.forEach(function (c) { html += '<th>' + inlineMd(c) + '</th>'; });
        html += '</tr></thead><tbody>';
        for (var i = bodyStart; i < rows.length; i++) {
            var cells = parseTableRow(rows[i]);
            html += '<tr>';
            cells.forEach(function (c) { html += '<td>' + inlineMd(c) + '</td>'; });
            html += '</tr>';
        }
        html += '</tbody></table>';
        return html;
    }

    function renderMarkdown(md) {
        var lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
        var html = [];
        var i = 0;
        var inCode = false;
        var codeBuf = [];
        var inTable = false;
        var tableRows = [];
        var listType = null;

        function flushList() {
            if (listType) { html.push('</' + listType + '>'); listType = null; }
        }
        function flushTable() {
            if (inTable) { html.push(renderTable(tableRows)); inTable = false; tableRows = []; }
        }

        while (i < lines.length) {
            var line = lines[i];
            var trimmed = line.trim();

            if (trimmed.indexOf('```') === 0) {
                flushList(); flushTable();
                if (inCode) {
                    html.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
                    codeBuf = []; inCode = false;
                } else {
                    inCode = true;
                }
                i++; continue;
            }
            if (inCode) { codeBuf.push(line); i++; continue; }

            if (!trimmed) { flushList(); flushTable(); i++; continue; }

            if (trimmed.charAt(0) === '|') {
                flushList();
                if (!inTable) { inTable = true; tableRows = []; }
                tableRows.push(trimmed);
                i++; continue;
            }
            flushTable();

            var h = trimmed.match(/^(#{1,6})\s+(.*)$/);
            if (h) {
                flushList();
                var lv = h[1].length;
                html.push('<h' + lv + '>' + inlineMd(h[2]) + '</h' + lv + '>');
                i++; continue;
            }

            if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
                flushList();
                html.push('<hr>');
                i++; continue;
            }

            var ul = trimmed.match(/^[-*+]\s+(.*)$/);
            if (ul) {
                if (listType !== 'ul') { flushList(); html.push('<ul>'); listType = 'ul'; }
                html.push('<li>' + inlineMd(ul[1]) + '</li>');
                i++; continue;
            }

            var ol = trimmed.match(/^\d+[.)]\s+(.*)$/);
            if (ol) {
                if (listType !== 'ol') { flushList(); html.push('<ol>'); listType = 'ol'; }
                html.push('<li>' + inlineMd(ol[1]) + '</li>');
                i++; continue;
            }

            flushList();
            var para = [trimmed];
            i++;
            while (i < lines.length) {
                var t = lines[i].trim();
                if (!t) break;
                if (t.indexOf('```') === 0) break;
                if (t.charAt(0) === '|') break;
                if (/^(#{1,6})\s/.test(t)) break;
                if (/^[-*+]\s/.test(t)) break;
                if (/^\d+[.)]\s/.test(t)) break;
                if (/^(-{3,}|\*{3,})$/.test(t)) break;
                para.push(t);
                i++;
            }
            html.push('<p>' + para.map(inlineMd).join('<br>') + '</p>');
        }
        flushList(); flushTable();
        if (inCode) html.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');

        return html.join('');
    }

    return { load: load, switchDoc: switchDoc, switchCreative: switchCreative };
})();
