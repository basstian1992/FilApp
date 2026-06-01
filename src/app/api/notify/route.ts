import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { webhookUrl, payload } = await request.json();

    if (!webhookUrl) {
      return NextResponse.json({ success: false, error: 'No webhook URL provided' });
    }

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return NextResponse.json({ success: true, status: res.status });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
