"""Render the actual built Jinja template with synthetic subscription data for browser QA."""
import base64,json
from pathlib import Path
from types import SimpleNamespace as NS
from jinja2 import Environment, select_autoescape

root=Path(__file__).resolve().parents[1]
user=dict(id=1,username='zomorod-demo',status='active',used_traffic=12*1024**3,lifetime_used_traffic=38*1024**3,data_limit=50*1024**3,data_limit_reset_strategy='no_reset',expire='2026-12-12T20:30:00+03:30',on_hold_expire_duration=0,on_hold_timeout=None,group_ids=[],created_at='2026-11-01T00:00:00Z',edit_at=None,online_at='2026-11-12T10:30:00Z',next_plan=None)
vmess=base64.urlsafe_b64encode(json.dumps({'ps':'🇳🇱 هلند','add':'nl.example.com','port':443},ensure_ascii=False).encode()).decode()
links=['vless://demo@de.example.com:443?security=tls#%F0%9F%87%A9%F0%9F%87%AA%20%D8%A2%D9%84%D9%85%D8%A7%D9%86','vmess://'+vmess,'trojan://demo@tr.example.com:443#%F0%9F%87%B9%F0%9F%87%B7%20%D8%AA%D8%B1%DA%A9%DB%8C%D9%87','wireguard://demo-private-key@wg.example.com:51820?publickey=demo-public-key&address=10.0.0.2%2F32#WireGuard']
apps=[dict(name='Hiddify',platform='ios',icon_url='https://example.com/icon.svg',import_url='hiddify://import/https://example.com/sub/demo',recommended=True,description={'fa':'اتصال ساده با وارد کردن لینک اشتراک','en':'Import your subscription to get started'},download_links=[{'name':'App Store','url':'https://apps.apple.com','language':'en'}]),dict(name='Hiddify',platform='android',icon_url='https://example.com/icon.svg',import_url='hiddify://import/demo',recommended=True,description={'en':'A simple subscription client'},download_links=[{'name':'Google Play','url':'https://play.google.com','language':'en'}])]
proxy=dict(vmess=None,vless=None,trojan=None,shadowsocks=None,wireguard=None,hysteria=None)
render_user={**user,'status':NS(name=user['status']),'data_limit_reset_strategy':NS(name='no_reset'),'expire':NS(isoformat=lambda:user['expire']),'created_at':NS(isoformat=lambda:user['created_at']),'online_at':NS(isoformat=lambda:user['online_at']),'proxy_settings':NS(**proxy)}
env=Environment(autoescape=select_autoescape(['html']))
html=env.from_string((root/'dist/index.html').read_text()).render(user=NS(**render_user),links=links,apps=[NS(**{**a,'download_links':[NS(**d) for d in a['download_links']]}) for a in apps])
html=html.replace('</body>','<script>'+(root/'plugin/zomorod-runtime.js').read_text()+'</script></body>')
(root/'dist/preview.html').write_text(html)
(root/'dist/fixture.json').write_text(json.dumps({'user':user,'links':links,'apps':apps},ensure_ascii=False))
print('Rendered built Jinja template with synthetic data')
