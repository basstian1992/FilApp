import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { chatId, message, botToken } = await request.json();

    if (!chatId || !message || !botToken) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos (chatId, message, botToken)' },
        { status: 400 }
      );
    }

    // Clean any accidental spaces or characters in Chat ID
    const cleanChatId = chatId.toString().trim();
    const cleanToken = botToken.toString().trim();

    const url = `https://api.telegram.org/bot${cleanToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    const data = await response.json();

    if (response.ok && data.ok) {
      return NextResponse.json({ success: true, data });
    } else {
      return NextResponse.json(
        { error: data.description || 'Error de Telegram al enviar el mensaje.' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error al enviar Telegram:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
