import net from "node:net";

export class BifasicClient {
  private host: string;
  private port: number;

  constructor(host = "127.0.0.1", port = 28790) {
    this.host = host;
    this.port = port;
  }

  private sendCommand(payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();

      client.connect(this.port, this.host, () => {
        client.write(JSON.stringify(payload));
      });

      client.on("data", (data) => {
        try {
          const response = JSON.parse(data.toString("utf-8"));
          resolve(response);
        } catch (e) {
          reject(e);
        } finally {
          client.destroy();
        }
      });

      client.on("error", (err) => {
        reject(err);
      });

      client.setTimeout(2000, () => {
        client.destroy();
        reject(new Error("Timeout conectando al Bifasic Engine"));
      });
    });
  }

  public async ping() {
    return this.sendCommand({ action: "ping" });
  }

  public async injectEnergy(indices: number[], energy: number) {
    return this.sendCommand({ action: "inject", indices, energy });
  }

  public async step() {
    return this.sendCommand({ action: "step" });
  }
}
