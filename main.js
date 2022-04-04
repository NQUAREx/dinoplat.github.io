let canvas = document.getElementById("main_canvas")

let theme_1 = {
	background: {
		color: "black",
		image: "none"
	},
	player: {
		color: "blue",
		image: "none"
	},
	block: {

	}
}


class Game {
	constructor(mainloop, canvas, width, theme) {
		this.mainloop = mainloop
		this.width = width
		this.theme = theme

		this.canvas = canvas
		this.ctx = canvas.getContext('2d')
		this.canvas.width = window.innerWidth
		this.canvas.height = window.innerHeight

		this.scale = canvas.width / this.width
		this.player.x = random(0, this.width - 1)
	}

	over() {
		alert("game over!")
	}

	start() {
		requestAnimationFrame(this.mainloop)
	}

	step(dt) {
		// this.ctx.fillStyle = "rgba(255, 255, 255, 0.5)"
		// this.ctx.fillRect(this.player.x2, this.canvas.height - this.scale * 6, this.scale, this.scale)
		if (this.player.lives <= 0) game.over()
		if (this.player.x > this.player.x2) this.player.x2 += dt / game.scale
		if (this.player.x < this.player.x2) this.player.x2 -= dt / game.scale
	}
	
	render() {
		if (this.theme.background.image == "none") {
			// this.ctx.fillStyle = this.theme.background.color
			this.ctx.fillStyle = "rgba(255, 255, 255, 0.1)"
			this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
		} else {

		}

		this.ctx.fillStyle = game.theme.player.color
		this.ctx.fillRect(this.player.x2 * this.scale, this.canvas.height - this.scale * 4, this.scale, this.scale)
	}

	player = {
		x: 0,
		x2: 0,
		lives: 5,
		alpha: 0
	}

	score = 0
	blocks = []
}


let game = new Game(loop, canvas, 6, theme_1)
let time

function loop() {
	requestAnimationFrame(loop)
	let now = new Date().getTime(),
		dt = now - (time || now)

	time = now

	game.step(dt)
	game.render()
}

function random(min, max) {
	min = Math.ceil(min)
	max = Math.floor(max)
	return Math.floor(Math.random() * (max - min + 1)) + min
}

document.addEventListener("touchstart", touchHandler, true);
document.addEventListener("touchend", touchHandler, true);
document.addEventListener("touchcancel", touchHandler, true);

function touchHandler(event) {
	let touches = event.changedTouches,
		first = touches[0],
		type = "";
	switch (event.type) {
		case "touchstart": {
			type = "mousedown";
			break;
		}
		case "touchend": {
			type = "mouseup";
			break;
		}
		default: {
			return;
		}
	}
	let simulatedEvent = document.createEvent("MouseEvent");
	simulatedEvent.initMouseEvent(type, true, true, window, 1,
		first.screenX, first.screenY,
		first.clientX, first.clientY, false,
		false, false, false, 0 /*left*/ , null);
	      first.target.dispatchEvent(simulatedEvent);

}

document.addEventListener('mousedown', (event) => {
	if (event.x > document.documentElement.clientWidth / 2) {
		if (game.player.x < game.width - 1) ++game.player.x
	} else {
		if (game.player.x > 0) --game.player.x
	}
}, false);

game.start()
