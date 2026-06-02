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

    // Clean any accidental spaces or characters
    const cleanPhone = phone.toString().replace(/[^0-9]/g, '');
    const cleanApiKey = apikey.toString().trim();
    
    // CallMeBot requires URL encoding for the message
    const encodedMessage = encodeURIComponent(message);

    const url = `https://api.callmebot.com/whatsapp.php?phone=${cleanPhone}&text=${encodedMessage}&apikey=${cleanApiKey}`;

    const response = await fetch(url, {
      method: 'GET' // CallMeBot uses GET requests
    });

    const data = await response.text();

    if (response.ok && !data.includes('Error')) {
      return NextResponse.json({ success: true, data });
    } else {
      return NextResponse.json(
        { error: 'Error de CallMeBot al enviar el mensaje de WhatsApp. Verifique sus credenciales.' },
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
