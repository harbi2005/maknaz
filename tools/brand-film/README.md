# brand-film — الفيلم التعريفي

مولّد إجرائي للفيلم التعريفي (60 ثانية، 1920×1080، 30 إطارًا/ث): مشاهد التضاريس والواجهة والشعار مرسومة برمجيًا، وموسيقى مركّبة رقميًا. لا لقطات أو موسيقى من مصادر خارجية.

| الملف | الدور |
|---|---|
| `src/config.py` | اللوحة، الخطوط، توقيت المشاهد |
| `src/scenes.py` · `src/ui.py` · `src/terrain.py` · `src/lib.py` | المشاهد وعناصر الواجهة والتضاريس والمعالجة النهائية |
| `src/render.py` | توليد صور ثابتة أو الفيديو |
| `src/audio.py` | الموسيقى التصويرية |
| `extract_logo.py` | استخراج الرمز والكلمة من لوحة الهوية إلى `brand/logo/` |

```bash
cd tools/brand-film/src
python3 render.py stills 0 450 900 1500     # صور ثابتة في ../out/stills/
python3 render.py video 4                   # فيديو بأربع عمليات ← ../out/video_noaudio.mp4
python3 audio.py                            # ../out/soundtrack.wav
ffmpeg -i ../out/video_noaudio.mp4 -i ../out/soundtrack.wav -c:v copy -c:a aac -shortest ../out/MAKNAZ_film.mp4
```

- `cache/` و`out/` مستبعدان من Git؛ الفيديو النهائي يُنشر عبر GitHub Releases بعد الموافقة.
- يعرض الفيلم المفهوم الحالي (سوق B2B + تنسيق النقل)، **دون ذكاء اصطناعي**. نسخة الفيلم الأولى مُستبدلة.
- الخط اللاتيني الاحتياطي IBM Plex Sans؛ Montserrat اختياري إن وُضع في `brand/fonts/montserrat/`.
