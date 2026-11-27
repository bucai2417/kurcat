"""Extract the user-supplied Naiwa design sheet into a small, articulated sprite kit.
Authoring only: Pillow, NumPy, OpenCV, PySide6. Never run as part of a build.
Usage: python scripts/extract-naiwa-art.py path/to/reference.png
The runtime uses the checked-in PNGs; no Python dependencies are required.
"""
from pathlib import Path
import sys, json
import cv2
import numpy as np
from PIL import Image
from PySide6.QtGui import QImage, QPainter, QPainterPath, QColor
from PySide6.QtCore import Qt

src = np.array(Image.open(sys.argv[1]).convert('RGB'))
if src.shape[:2] != (1024, 1536):
    raise ValueError('Expected the supplied 1536 x 1024 design sheet; do not stretch a different reference.')
out = Path(__file__).resolve().parents[1] / 'src' / 'assets' / 'naiwa'
out.mkdir(parents=True, exist_ok=True)

def pathmask(w, h, commands):
    im = QImage(w * 4, h * 4, QImage.Format_RGBA8888)
    im.fill(Qt.transparent)
    p = QPainter(im); p.setRenderHint(QPainter.Antialiasing); p.scale(4, 4)
    path = QPainterPath()
    for op, args in commands:
        getattr(path, op)(*args)
    p.fillPath(path, QColor('white')); p.end()
    a = np.frombuffer(im.constBits(), np.uint8).reshape(h*4, w*4, 4)[:,:,3]
    return cv2.resize(a, (w,h), interpolation=cv2.INTER_AREA)

def save(name, rgb, alpha):
    Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), 'RGBA').save(out / (name + '.png'), optimize=True)

# One continuous head/torso surface. Face features are removed for independent
# eyelids, gaze and mouth animation; original lighting/belly detail is retained.
face = np.zeros(src.shape[:2], np.uint8)
cv2.ellipse(face, (185,70), (19,22), 0, 0,360,255,-1)
cv2.ellipse(face, (262,70), (19,22), 0, 0,360,255,-1)
cv2.ellipse(face, (224,95), (34,10), 0, 0,360,255,-1)
clean = cv2.inpaint(src, face, 5, cv2.INPAINT_TELEA)
# Fit local skin shading around each eye, excluding green iris and background.
# Restrict replacement to the iris footprint so it cannot leave a broad flat patch.
for ex in [185,262]:
    ys,xs=np.mgrid[43:101,ex-24:ex+25]
    patch=src[43:101,ex-24:ex+25].astype(float)
    nx=(xs-ex)/24; ny=(ys-70)/28
    basis=np.stack([np.ones_like(nx),nx,ny,nx*nx,nx*ny,ny*ny],axis=-1)
    d=((xs-ex)/17.5)**2+((ys-70)/19)**2
    valid=(d>1.1)&(patch[:,:,0]>210)&(patch[:,:,0]-patch[:,:,2]>85)&(patch[:,:,1]>155)
    coeff=np.linalg.lstsq(basis[valid],patch[valid],rcond=None)[0]
    fitted=np.clip(basis@coeff,0,255)
    weight=np.clip((1.15-d)*8,0,1)[:,:,None]
    clean[43:101,ex-24:ex+25]=np.clip(patch*(1-weight)+fitted*weight,0,255)
mouth_mask = np.zeros(src.shape[:2], np.uint8)
cv2.ellipse(mouth_mask, (224,95), (34,10), 0,0,360,255,-1)
clean = cv2.inpaint(clean, mouth_mask, 5, cv2.INPAINT_TELEA)
commands = [
 ('moveTo',(224,35)),
 ('cubicTo',(177,29,166,48,160,84)),
 ('cubicTo',(157,121,149,140,146,162)),
 ('cubicTo',(143,184,133,199,127,221)),
 ('cubicTo',(120,261,130,289,148,310)),
 ('cubicTo',(165,337,281,337,303,310)),
 ('cubicTo',(318,285,329,254,320,217)),
 ('cubicTo',(315,199,305,184,302,162)),
 ('cubicTo',(299,140,289,117,286,84)),
 ('cubicTo',(282,48,272,33,224,35)),('closeSubpath',())]
a = pathmask(1536,1024,commands)
# Pixels outside the artist's silhouette are excluded as well (subpixel white fringe).
sat = clean.max(2).astype(float)-clean.min(2).astype(float)
a = np.minimum(a, np.clip((sat-16)*255/24,0,255).astype(np.uint8))
box = (110,30,340,340); x0,y0,x1,y1=box
save('body', clean[y0:y1,x0:x1], a[y0:y1,x0:x1])
# Material zones for palette editing, separate from opacity.
belly = pathmask(1536,1024,[('moveTo',(224,156)),('cubicTo',(174,154,137,190,133,237)),('cubicTo',(124,279,163,301,223,301)),('cubicTo',(283,302,319,279,316,238)),('cubicTo',(313,194,276,156,224,156)),('closeSubpath',())])
Image.fromarray(belly[y0:y1,x0:x1], 'L').save(out/'belly-mask.png', optimize=True)

# Four distinct fingers are preserved, including the thumb silhouette.
x0,y0,x1,y1=88,247,126,306
hand=src[y0:y1,x0:x1].copy()
hsv=cv2.cvtColor(hand,cv2.COLOR_RGB2HSV)
mask=((hsv[:,:,1]>38)&(hsv[:,:,2]<205)).astype(np.uint8)*255
# Feather only the wrist, never the fingertips.
mask=(mask.astype(float)*np.clip(np.arange(hand.shape[0])[:,None]/8,0,1)).astype(np.uint8)
mask=cv2.GaussianBlur(mask,(3,3),.45)
save('hand',hand,mask)

# Sitting feet from the supplied "tired" pose, toes facing the viewer.
x0,y0,x1,y1=1070,889,1119,965
foot=src[y0:y1,x0:x1].copy(); hsv=cv2.cvtColor(foot,cv2.COLOR_RGB2HSV)
mask=((hsv[:,:,1]>35)&(hsv[:,:,2]<164)).astype(np.uint8)*255
num,lab,stats,_=cv2.connectedComponentsWithStats(mask)
if num>1: mask=(lab==(1+np.argmax(stats[1:,cv2.CC_STAT_AREA]))).astype(np.uint8)*255
mask=cv2.GaussianBlur(mask,(3,3),.45)
save('foot',foot,mask)

# Front prone pose from the same sheet. Remove baked facial features and leave
# forearms/hands to the continuous runtime surface, so sleeping has no fixed wrists.
prone_face = np.zeros(src.shape[:2], np.uint8)
for ex in [140, 242]: cv2.ellipse(prone_face, (ex,533), (24,28), 0,0,360,255,-1)
cv2.ellipse(prone_face, (191,575), (43,12), 0,0,360,255,-1)
prone_clean = cv2.inpaint(src, prone_face, 7, cv2.INPAINT_TELEA)
prone_alpha = pathmask(1536,1024,[
 ('moveTo',(205,468)),('cubicTo',(148,463,116,483,100,513)),
 ('cubicTo',(91,536,91,553,95,571)),('cubicTo',(99,594,119,599,171,599)),
 ('cubicTo',(235,602,279,600,298,589)),('cubicTo',(309,578,307,556,293,528)),
 ('cubicTo',(276,490,251,469,205,468)),('closeSubpath',())])
prone_box=(80,465,310,603); x0,y0,x1,y1=prone_box
save('prone', prone_clean[y0:y1,x0:x1], prone_alpha[y0:y1,x0:x1])

# Normalized skin boundaries let the runtime blend one solid silhouette, without
# transparent outlines from crossfading two differently shaped poses.
def contour(name):
    alpha = np.array(Image.open(out / (name + '.png')))[:, :, 3]
    h, w = alpha.shape
    bounds=[]
    occupied=np.flatnonzero(np.any(alpha>32,axis=1))
    for y in np.linspace(occupied[0], occupied[-1], 41):
        row=np.flatnonzero(alpha[round(y)]>32)
        bounds.append([round(y/(h-1),5),round(float(row[0])/(w-1),5) if len(row) else .5,
                       round(float(row[-1])/(w-1),5) if len(row) else .5])
    return bounds

# Eye and mouth source retained for documentation and offline comparisons.
Image.fromarray(src).resize((1152,768),Image.Resampling.LANCZOS).save(out/'reference.webp',quality=90,method=6)
(out/'artwork.json').write_text(json.dumps({
 'source':'User-provided Naiwa turnaround and expression sheet',
 'sourceSize':[1536,1024], 'bodyCrop':list(box),
 'bodyRect':[-.39,-.82,.78,.86],
 'facePivot':[0,-.653], 'eyes':[[-.136,-.709],[.126,-.709]],
 'defaultPose':'seated', 'parts':['body','prone','belly-mask','hand','foot'],
 'sleepContours':{'body':contour('body'),'prone':contour('prone')},
 'proneCrop':list(prone_box), 'proneRect':[-.39,-.43,.78,.466],
 'notes':'Reference-derived seated/prone body and feet; hand is an authoring reference. Runtime arms, palms and fingers form one surface; puffing is local to the mouth corners. No ears or tail. Runtime recolors material zones; no external images in skin packages.'
},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Wrote Naiwa layered artwork to',out)
