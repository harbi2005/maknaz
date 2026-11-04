"""Extract the MAKNAZ logo icon and wordmark from the supplied identity board (hero lockup).
Icon: convex-hull mask of the hexagonal symbol x luminance matte. Wordmark: luminance matte."""
import os
import cv2, numpy as np
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
B = lambda *p: os.path.join(REPO, 'brand', *p)
board = cv2.imread(B('identity', 'MAKNAZ_identity_board.png')).astype(np.float32)
def save(name, col, a):
    ys,xs = np.where(a>0.03)
    y0,y1,x0,x1 = max(ys.min()-3,0), ys.max()+4, max(xs.min()-3,0), xs.max()+4
    rgba = np.dstack([np.clip(col,0,255), np.clip(a*255,0,255)])[y0:y1,x0:x1].astype(np.uint8)
    cv2.imwrite(B('logo', f'{name}.png'), rgba); return rgba
# ---- icon
X0,Y0,X1,Y1 = 280,140,485,365
c = board[Y0:Y1,X0:X1]; lum = c.mean(2)
m = (lum>82).astype(np.uint8)
n,lab,st,_ = cv2.connectedComponentsWithStats(m)
keep = [i for i in range(1,n) if st[i,cv2.CC_STAT_AREA]>150]
pts = cv2.findNonZero(np.isin(lab,keep).astype(np.uint8))
hull = cv2.convexHull(pts)
hm = np.zeros(lum.shape,np.uint8); cv2.fillConvexPoly(hm,hull,255)
hm = cv2.erode(hm,np.ones((3,3),np.uint8)).astype(np.float32)/255
hm = cv2.GaussianBlur(hm,(0,0),0.7)
a = np.clip((lum-36)/22,0,1); a = a*a*(3-2*a)
a *= hm
bgc = np.array([30,30,30],np.float32)
col = (c - bgc*(1-a[...,None]))/np.maximum(a[...,None],1e-3)
icon = save('logo_icon', col, a)
# ---- wordmark (Arabic مَكْنَز + MAKNAZ) exactly as supplied
X0,Y0,X1,Y1 = 485,185,712,312
c = board[Y0:Y1,X0:X1]; lum = c.mean(2)
bg = cv2.GaussianBlur(cv2.erode(lum,np.ones((15,15))),(0,0),8)
a = np.clip((lum-bg-18)/120,0,1)
word = save('logo_wordmark_light', np.ones_like(c)*np.array([241,246,247],np.float32), a)
print(icon.shape, word.shape)
for nm,im in [('icon',icon),('word',word)]:
  for bn,bgc in [('dark',(43,41,37)),('sand',(221,229,233))]:
    f=im.astype(np.float32); al=f[...,3:]/255
    o=f[...,:3]*al+np.array(bgc,np.float32)*(1-al)
    cv2.imwrite(os.path.join(os.environ.get('TMPDIR', '/tmp'), f'p_{nm}_{bn}.png'), cv2.resize(o,None,fx=2,fy=2,interpolation=cv2.INTER_LANCZOS4).clip(0,255).astype(np.uint8))
