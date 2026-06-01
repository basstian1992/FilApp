import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { phone, message, apikey } = await request.json();

    if (!phone || !message || !apikey) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos (phone, message, apikey)' },
        { status: 400 }
      );
    }

    // CallMeBot requires international phone format without leading plus or with it.
    // Let's strip spaces, dashes, parentheses and the plus sign to make it super robust.
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodeURIComponent(message)}&apikey=${apikey}`;

    // CallMeBot responds with text, let's fetch it on the server-side to avoid CORS blocks in the client browser
    const response = await fetch(url);
    const textResponse = await response.text();

    if (response.ok) {
      return NextResponse.json({ success: true, response: textResponse });
    } else {
      return NextResponse.json(
        { error: `Error de CallMeBot: ${textResponse}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error al enviar WhatsApp:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
