import {NextResponse, type NextRequest} from 'next/server';

export function middleware(request: NextRequest) {
  const key = request.headers.get('x-api-key');
  if (!process.env.BACKEND_API_KEY || key !== process.env.BACKEND_API_KEY) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
