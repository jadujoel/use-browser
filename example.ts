import fs from "node:fs";
import { useBrowser } from "use-browser";

type ReadFile = (path: string) => Promise<string>;
type WriteFile = (path: string, content: ArrayBuffer | string) => Promise<void>;

export async function main() {
	const str = fs.readFileSync("package.json", "utf-8");
	const pkg = JSON.parse(str);

	interface MainOptions {
		readonly pkg: Record<string, unknown>;
		readonly rf: ReadFile;
		readonly wf: WriteFile;
	}

	const result = await useBrowser({
		backend: "webkit",
		main: async (
			options: MainOptions,
		): Promise<{ currentTime: number; frequency: number }> => {
			const ctx = new AudioContext({
				sampleRate: 48_000,
				latencyHint: "playback",
			});
			const osc = ctx.createOscillator();
			osc.connect(ctx.destination);
			osc.frequency.setValueCurveAtTime(
				[220, 440, 880, 440, 220],
				ctx.currentTime,
				2,
			);
			osc.start();
			osc.stop(ctx.currentTime + 2);

			await new Promise((resolve) => {
				osc.onended = () => {
					resolve(undefined);
				};
			});

			await options.wf("hello.txt", "Hello, world!");
			const hello = await options.rf("hello.txt");
			console.log("Read back from hello.txt:", hello);

			return {
				currentTime: ctx.currentTime,
				frequency: osc.frequency.value,
			};
		},
		parameters: [
			{
				pkg,
				rf: async (path: string) => {
					return await Bun.file(path).text();
				},
				wf: async (path, content) => {
					await Bun.write(path, content);
				},
			},
		],
	});
	console.log("Result from WebView", result);
}

if (import.meta.main) {
	await main();
}
