
module.exports.Future = class Future {
	constructor() {
		this.value = new Promise((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}
