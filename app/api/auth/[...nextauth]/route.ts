import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
scope: "streaming user-read-email user-read-private playlist-read-private playlist-read-collaborative user-modify-playback-state"

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };