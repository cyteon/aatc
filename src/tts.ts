import Replicate from "replicate";

const replicate = new Replicate({
  baseUrl: process.env.REPLICATE_BASE_URL,
  auth: process.env.REPLICATE_API_TOKEN,
});

const input = {
  voice: "Ashley",
  text: "N three two zero S B, Gardermoen Tower, squawk six five one six, runway zero one left, wind zero ten degrees 12 knots, hold position, confirm you have IFR clearance.",
};

const output = await replicate.run(process.env.REPLICATE_MODEL!, { input });
console.log(output.url());
