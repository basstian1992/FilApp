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

    // Keep the + sign if the user typed it (CallMeBot sometimes needs it)
    const cleanPhone = phone.toString().replace(/[^0-9+]/g, '');
    const cleanApiKey = apikey.toString().trim();
    
    // CallMeBot requires URL encoding
    const encodedMessage = encodeURIComponent(message);
    const encodedPhone = encodeURIComponent(cleanPhone);

    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodedPhone}&text=${encodedMessage}&apikey=${cleanApiKey}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });

    const data = await response.text();

    if (response.ok && !data.includes('Error')) {
      return NextResponse.json({ success: true, data });
    } else {
      console.error('CallMeBot Error:', data);
      return NextResponse.json(
        { error: `Error de CallMeBot: ${data}` },
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
