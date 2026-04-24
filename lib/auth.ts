import { NextAuthOptions } from "next-auth";
import SpotifyProvider from "next-auth/providers/spotify";

export const authOptions: NextAuthOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: {
        params: { 
          // 1. Adicionamos o user-read-playback-state aqui
          scope: "streaming user-read-email user-read-private playlist-read-private playlist-read-collaborative user-modify-playback-state user-read-playback-state",
          // 2. Isso FORÇA o Spotify a perguntar de novo e limpar o cache do token velho
          show_dialog: true 
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, account }) {
      if (account) token.accessToken = account.access_token;
      return token;
    },
    async session({ session, token }: any) {
      session.accessToken = token.accessToken;
      return session;
    },
  },
};