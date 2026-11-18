declare module 'nodemailer' {
  interface Transport {
    sendMail(options: {
      from: string;
      to: string;
      subject: string;
      text: string;
    }): Promise<unknown>;
  }
  const nodemailer: {
    createTransport(options: {
      host?: string;
      port?: number;
      secure?: boolean;
      requireTLS?: boolean;
      tls?: { minVersion: string };
      auth?: { user: string; pass: string };
      pool?: boolean;
      maxConnections?: number;
      maxMessages?: number;
      connectionTimeout?: number;
      greetingTimeout?: number;
      socketTimeout?: number;
      disableFileAccess?: boolean;
      disableUrlAccess?: boolean;
      streamTransport?: boolean;
      buffer?: boolean;
    }): Transport;
  };
  export default nodemailer;
}
