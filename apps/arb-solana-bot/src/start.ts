import {
	Config as BotConfig,
	PingPongStrategy,
	SolscanDataProvider,
	createBot,
	extendBot,
	plugins,
	sleep,
} from "@arb-protocol/core";
import { startTUI } from "@arb-protocol/tui";
import { runWizard } from "@arb-protocol/wizard";

import fs from "fs";
import path from "path";
import { validateEnv } from "./validate-env";

// set process title
process.title = `ARB v2.0`;

// import { io } from "socket.io-client";

export const start = async () => {
	await sleep(1000); // wait for logger
	try {
		// TODO: finish WS integration
		// const socket = io("http://localhost:1337");

		// socket.on("connect", () => {
		// 	console.log("CLIENT ! socket connected");
		// });

		// socket.on("disconnect", () => {
		// 	console.log("CLIENT ! socket disconnected");
		// });

		// socket.on("strategy:scheduled", (args) => {
		// 	console.log("CLIENT ! strategy:scheduled", {
		// 		sentAt: args.sentAt,
		// 		receivedAt: Date.now(),
		// 		latency: Date.now() - args.sentAt,
		// 	});
		// });

		const ENV = await validateEnv();

		// // if there is no config.json file, run the wizard that will generate one
		if (!fs.existsSync("./config.json")) await runWizard();
		// // if there is no temp directory, create it
		if (!fs.existsSync("./temp")) fs.mkdirSync("./temp");
		// fs get config.json
		const config: Omit<BotConfig, "rpcURLs" | "rpcWSSs" | "wallets"> & {
			$schema: string;
			tui: { allowClearConsole: boolean };
			strategy: {
				id: string;
				amount: number;
				executeAboveExpectedProfitPercent: number;
				priorityFeeMicroLamports?: number;
				enableCompounding?: boolean;
				slippage: {
					bps: number;
					enableAutoSlippage: boolean;
				};
				tokens: string[];
			};
		} = JSON.parse(fs.readFileSync("./config.json", "utf8"));

		if (!config?.strategy?.tokens) {
			throw new Error("Missing tokens array in the config.json");
		}

		if (!config?.strategy?.amount) {
			throw new Error("Missing amount in the config.json");
		}

		if (!config?.strategy?.slippage?.bps && !config?.strategy?.slippage?.enableAutoSlippage) {
			throw new Error("Missing slippage in the config.json");
		}

		if (!(config?.strategy?.executeAboveExpectedProfitPercent >= 0)) {
			throw new Error("Missing executeAboveExpectedProfitPercent in the config.json");
		}

		PingPongStrategy.setConfig({
			tokens: config.strategy.tokens as string[],
			amount: config.strategy.amount,
			slippage: config.strategy.slippage.bps || 5,
			executeAboveExpectedProfitPercent: config.strategy.executeAboveExpectedProfitPercent,
			priorityFeeMicroLamports: config.strategy.priorityFeeMicroLamports,
			enableAutoSlippage: config.strategy.slippage.enableAutoSlippage,
			enableCompounding: config.strategy.enableCompounding ?? false,
		});

		const bot = extendBot(
			createBot,
			plugins.withGreeter
		)({
			strategies: [PingPongStrategy],
			aggregators: [
				// TODO: maybe try to auto load all aggregators with absolute paths
				path.resolve(__dirname, "aggregators/jupiter-aggregator.js"),
			],
			dataProviders: [SolscanDataProvider],
			config: {
				maxConcurrent: 1,
				wallets: [ENV.SOLANA_WALLET_PRIVATE_KEY],
				rpcURLs: [ENV.DEFAULT_RPC],
				rpcWSSs: [process.env.DEFAULT_RPC_WSS as string],
				limiters: config.limiters,
				arbProtocolBuyBack: config.arbProtocolBuyBack,
			},
		});

		if (!bot) throw new Error("Bot failed to start");

		// Terminal User Interface
		startTUI(bot, {
			/** Default true */
			allowClearConsole: config?.tui?.allowClearConsole,
			fps: ENV.TUI_FPS,
		});

		await bot.start();
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
};
