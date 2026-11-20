"""Listening page for the master experiments: ONE song, the original and every technique, with the metrics beside.

Opens from disk, loads nothing from the network, paths relative to the page. All versions play at once in sync;
a switch only changes which is audible (no seek into a cold file, no gap). Matched loudness (default) turns
every version down to the quietest one's integrated loudness, so a switch compares tone and not level;
'as delivered' plays each at its own level. Keys: 1..N switch, space stop, left/right seek 5 s.
"""

import html
import os


def page(title, items, out_path):
    """items: [{label, file, note, m}] - the first is the original. m: metrics dict (or None for the original)."""
    d = os.path.dirname(os.path.abspath(out_path))
    lufs = [i["lufs"] for i in items]
    floor = min(lufs)
    rows, cells = [], []
    for k, it in enumerate(items):
        vol = min(1.0, 10 ** ((floor - it["lufs"]) / 20))
        rel = os.path.relpath(it["file"], d).replace("\\", "/")
        m = it.get("m")
        cells.append(
            f'<audio id="a{k}" preload="auto" src="{html.escape(rel)}" data-matched="{vol:.4f}"></audio>'
        )
        b = (m or {}).get("bands", {})
        rows.append(
            f'<tr data-k="{k}"><td><button data-k="{k}">{k + 1} &middot; {html.escape(it["label"])}</button>'
            f'<span class="n">{html.escape(it.get("note", ""))}</span></td>'
            f'<td class="num">{it["lufs"]:.1f}</td><td class="num">{it["tp"]:.1f}</td>'
            f'<td class="num">{(m or {}).get("lra", it.get("lra", ""))}</td>'
            f'<td class="num">{"-" if m is None else m["wobble_db"]}</td>'
            f'<td class="num">{"-" if m is None else m["null_db"]}</td>'
            f'<td class="num">{"-" if m is None else m["hf_db"]}</td>'
            f'<td class="num">{"-" if m is None else m.get("tp_mp3", "")}</td>'
            f'<td class="num">{"" if not b else " ".join(f"{v:+.1f}" for v in b.values())}</td></tr>'
        )
    doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
:root{{color-scheme:dark;--bg:#111317;--panel:#1a1d23;--ink:#e8eaed;--dim:#a3a9b3;--line:#2c313a;--on:#7cb7ff}}
body{{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,sans-serif}}
h1{{font-size:18px;margin:0 0 4px}}.bar{{display:flex;flex-wrap:wrap;gap:14px;align-items:center;color:var(--dim);font-size:13px;margin:0 0 14px}}
.wrap{{overflow-x:auto}}table{{border-collapse:collapse;width:100%;min-width:1000px;background:var(--panel)}}
th,td{{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:13px;vertical-align:top}}
thead th{{color:var(--dim);font-weight:600;font-size:12px}}.num{{font-variant-numeric:tabular-nums;white-space:nowrap}}
button{{background:#262b33;color:var(--ink);border:1px solid var(--line);border-radius:4px;padding:6px 12px;font:600 13px system-ui;cursor:pointer}}
button.on{{background:var(--on);color:#0b0d10;border-color:var(--on)}}.n{{display:block;color:var(--dim);font-size:12px;margin-top:4px;max-width:46ch}}
input[type=range]{{width:420px}}kbd{{border:1px solid var(--line);border-radius:3px;padding:0 4px;font:12px ui-monospace,monospace}}
</style></head><body>
<h1>{html.escape(title)}</h1>
<div class="bar">
<label><input type="radio" name="mode" value="matched" checked> matched loudness</label>
<label><input type="radio" name="mode" value="delivered"> as delivered</label>
<span><kbd>1</kbd>-<kbd>{len(items)}</kbd> switch &middot; <kbd>space</kbd> stop &middot; <kbd>&larr;</kbd><kbd>&rarr;</kbd> 5 s</span>
<input type="range" id="seek" min="0" max="1000" value="0" aria-label="Position"><span id="t">0:00</span></div>
<div class="wrap"><table>
<thead><tr><th>Version</th><th>LUFS</th><th>TP</th><th>LRA</th><th title="std of the 100 ms level difference vs original, dB: 0 = a pure gain change">wobble dB</th><th>null dB</th><th>12-22k dB</th><th>TP after mp3</th><th>band change dB: low / lowmid / mid / pres / air</th></tr></thead>
<tbody>
{chr(10).join(rows)}
</tbody></table></div>
{chr(10).join(cells)}
<script>
(function(){{
  var as=[].slice.call(document.querySelectorAll('audio')),cur=-1,mode='matched',tok=0;
  function vol(a){{return mode==='matched'?Number(a.dataset.matched):1;}}
  function apply(){{as.forEach(function(a,i){{a.volume=i===cur?vol(a):0;}});document.querySelectorAll('button[data-k]').forEach(function(b){{b.classList.toggle('on',Number(b.dataset.k)===cur);}});}}
  function ready(a){{return new Promise(function(res){{if(a.readyState>=3)return res();a.addEventListener('canplay',function(){{res();}},{{once:true}});a.addEventListener('error',function(){{res();}},{{once:true}});a.load();}});}}
  function stop(){{tok++;as.forEach(function(a){{a.pause();}});cur=-1;apply();}}
  function start(k){{var t=cur>=0?as[cur].currentTime:0,my=++tok;cur=k;apply();
    Promise.all(as.map(ready)).then(function(){{if(my!==tok)return;as.forEach(function(a){{try{{a.currentTime=t;}}catch(_){{}}}});apply();as.forEach(function(a){{a.play();}});}});}}
  function play(k){{if(cur<0||as.every(function(a){{return a.paused;}}))return start(k);var t=as[cur].currentTime;cur=k;if(Math.abs(as[k].currentTime-t)>0.04)as[k].currentTime=t;apply();}}
  document.addEventListener('click',function(e){{var b=e.target.closest('button[data-k]');if(b)play(Number(b.dataset.k));}});
  document.addEventListener('change',function(e){{if(e.target.name==='mode'){{mode=e.target.value;apply();}}}});
  document.addEventListener('keydown',function(e){{
    if(e.key===' '){{e.preventDefault();stop();return;}}
    if(e.key==='ArrowRight'||e.key==='ArrowLeft'){{if(cur<0)return;var d=e.key==='ArrowRight'?5:-5;as.forEach(function(a){{a.currentTime=Math.max(0,a.currentTime+d);}});return;}}
    var k=Number(e.key)-1;if(k>=0&&k<as.length)play(k);}});
  setInterval(function(){{if(cur<0)return;var a=as[cur];if(!a.duration)return;document.getElementById('seek').value=Math.round(a.currentTime/a.duration*1000);
    var s=Math.floor(a.currentTime);document.getElementById('t').textContent=Math.floor(s/60)+':'+('0'+s%60).slice(-2);
    as.forEach(function(b,i){{if(i!==cur&&!b.paused&&Math.abs(b.currentTime-a.currentTime)>0.05)b.currentTime=a.currentTime;}});}},500);
  document.getElementById('seek').addEventListener('input',function(e){{if(cur<0)return;var t=Number(e.target.value)/1000*as[cur].duration;as.forEach(function(a){{try{{a.currentTime=t;}}catch(_){{}}}});}});
  apply();
}})();
</script></body></html>
"""
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(doc)
