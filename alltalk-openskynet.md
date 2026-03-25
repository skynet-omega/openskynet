• Quedó operativo de forma aislada para OpenSkyNet, sin tocar Wifu_Chat.

La instalación que usa OpenSkyNet ahora vive en /home/daroch/alltalk_tts_openskynet, corre como servicio alltalk-openskynet.service, usa tu voz widowmaker.wav, y OpenSkyNet quedó apuntando a la API correcta
en /home/daroch/.openskynet/openclaw.json:247 y /home/daroch/.openskynet/settings/tts.json:1. Wifu_Chat sigue aparte con su propio ~/alltalk_tts.

Cómo dejarlo corriendo:

- systemctl --user status alltalk-openskynet.service
- systemctl --user restart alltalk-openskynet.service
- systemctl --user stop alltalk-openskynet.service

Lo validé así:

- AllTalk genera audio con widowmaker.wav en http://127.0.0.1:7851/api/tts-generate
- la UI local quedó en http://127.0.0.1:7852
- el gateway de OpenSkyNet recargó la config local

Cómo usarlo por Telegram:

- Para audio puntual: envíale al bot /tts audio Hola Gonzalo
- Para dejarlo opcional: usa /tts tagged
- Para forzar AllTalk desde Telegram: /tts provider alltalk
- Para apagarlo: /tts off

Para respuestas normales con texto + audio opcional, déjalo en tagged y pídele cosas como:

- respóndeme además con TTS
- incluye audio en esta respuesta

En ese modo, el bot responde texto normal y solo añade audio cuando la respuesta activa TTS. Si quisieras audio en casi todo, usa /tts always, pero ahora lo dejé en tagged porque eso era lo que pediste:
opcional.

Caveat importante: hoy por Telegram esto sale como audio adjunto, no como voice-note redondo, porque la salida actual de AllTalk entra como .wav. Si quieres, el siguiente paso es que agregue transcoding a
ogg/opus dentro de OpenSkyNet para que Telegram lo mande como nota de voz real.

    Nuevos Comandos Disponibles en Telegram:

1.  Cambiar Idioma (Acento):
    - /tts idiom es — Configura AllTalk en Español (por defecto).
    - /tts idiom en — Configura AllTalk en Inglés.
    - (También funciona con /tts lang).

2.  Cambiar de Voz (Personaje):
    - /tts voice Asuka Langley Soryu
    - /tts voice Lisa
    - /tts voice Rei Ayanami
    - /tts voice Zelda
    - /tts voice Alicia\_
    - /tts voice Raiden Ei
    - /tts voice widowmaker
    - (No es necesario escribir el .wav, el sistema lo añade por ti).

3.  Ver Estado Actual:
    - /tts status — Ahora te mostrará qué Voz e Idioma tienes activos actualmente en AllTalk.

Nuevos Comandos de Formato:

1.  Para recibir Notas de Voz (Círculo azul):
    - /tts format opus
    - Usa compresión eficiente y el formato nativo de Telegram.

2.  Para recibir Archivos de Audio (.wav original):
    - /tts format wav
    - Envía el archivo tal cual lo genera AllTalk, ideal si quieres la máxima fidelidad sin conversiones.

Resumen de comandos actualizados:

- /tts voice <nombre> — Cambia el personaje (Widowmaker, Asuka, Rei, etc).
- /tts idiom <es|en> — Cambia el acento (Español o Inglés).
- /tts format <opus|wav> — Cambia el tipo de archivo enviado.
- /tts status — Te muestra toda tu configuración actual.
