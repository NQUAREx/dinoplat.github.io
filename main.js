let canvas = document.getElementById("main_canvas")

let theme_1 = {
	background: {
		color: "rgb(31.875, 31.875, 31.875)",
		image: "none"
	},
	player: {
		color: "magenta",
		background: "rgba(31.875, 31.875, 31.875, 0.2)",
		image: "none"
	},
	block: {
		color: "red",
		background: "rgba(31.875, 31.875, 31.875, 0.2)",
		image: "none"
	},
	font: {
		color: "white",
		style: "20px serif"
	},
	icons: {
		coin: function(ctx, scale) {ctx.fillStyle = "yellow"; ctx.fillRect(0, 0, scale, scale)}
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
		this.ctx.font = this.theme.font.style

		this.scale = canvas.width / this.width

		this.theme.icons.coin = renderBuf(this.scale, this.scale, this.theme.icons.coin)
	}

	over() {
		if (this.score > this.record_score) this.record_score = this.score
		this.score = 0
		cancelAnimationFrame(this.recId)
		this.start()
	}

	start() {
		this.reqId = requestAnimationFrame(this.mainloop)
		this.blocks.length = Math.round((this.canvas.height / 4) / this.scale)
		for (let i = 0; i < this.blocks.length; ++i) {
			this.blocks[i] = []
			this.blocks[i][1] = this.scale * i * 4
		}

		this.speed = 2.5
		this.player.x = random(1, this.width - 2)
	}

	step(dt) {
		this.recId = requestAnimationFrame(this.mainloop)
		if (this.player.lives <= 0) this.over()
		if (this.player.x > this.player.x2) this.player.x2 += 0.25
		if (this.player.x < this.player.x2) this.player.x2 -= 0.25

		for (let i = 0; i < this.blocks.length; ++i) {
			this.blocks[i][1] += dt / this.speed

			if (this.blocks[i][1] > this.canvas.height) {
				this.blocks[i][1] = this.scale * -1
				this.blocks[i][0] = (this.scale * random(0, this.width - 1))
				this.score++
			}

		// collision
		if (this.blocks[i][1] > (this.canvas.height - this.scale * 5) + 10 && this.blocks[i][0] == this.player.x * this.scale && this.blocks[i][1] < (this.canvas.height - this.scale * 3.5)) this.over()
		if (this.blocks[i][1] > (this.canvas.height - this.scale * 4) && this.blocks[i][0] == this.player.x * this.scale && this.blocks[i][1] < (this.canvas.height - this.scale * 3.5)) this.over()
		}


		if (this.speed > this.maxspeed) this.speed -= 0.00005
	}
	
	render() {
		// player background
		this.ctx.fillStyle = this.theme.player.background
		this.ctx.fillRect(0, (this.canvas.height - this.scale * (this.width - 1)), this.canvas.width, this.scale)

		// up & under player background
		this.ctx.fillStyle = this.theme.block.background
		this.ctx.fillRect(0, 0, this.canvas.width, (this.canvas.height - this.scale * (this.width - 1)))
		this.ctx.fillRect(0, (this.canvas.height - this.scale * (this.width - 1)) + this.scale, this.canvas.width, this.canvas.height - (this.canvas.height - this.scale * (this.width)))

		// player
		this.ctx.fillStyle = this.theme.player.color
		this.ctx.fillRect((this.player.x2 * this.scale), (this.canvas.height - this.scale * 4), this.scale, this.scale)

		// blocks
		this.ctx.fillStyle = this.theme.block.color
		for (let i = 0; i < this.blocks.length; ++i) {
			this.ctx.fillRect(this.blocks[i][0], this.blocks[i][1], this.scale, this.scale)
		}

		// score
		this.ctx.fillStyle = this.theme.font.color
		
		this.ctx.fillText("SCORE: " + this.score.toString(), 10, 20)
		this.ctx.fillText("RECORD: " + this.record_score.toString(), 10, 40)
		this.ctx.drawImage(this.theme.icons.coin, 100, 10)
	}

	player = {
		x: 0,
		x2: 0,
		lives: 5,
	}

	score = 0
	record_score = 0
	blocks = []		// [[x, y], [x, y], [x, y]]
	coins = []		// [[x, y], [x, y], [x, y]]
	speed = 2.5
	maxspeed = 1
}

let game = new Game(loop, canvas, 24, theme_1)
let time

// main block

function loop() {
	let now = new Date().getTime(),
		dt = now - (time || now)

	time = now

	game.step(dt)
	game.render()
}

// system functions

function random(min, max) {
	min = Math.ceil(min)
	max = Math.floor(max)
	return Math.floor(Math.random() * (max - min + 1)) + min
}

function renderBuf(width, height, render) {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	render(canvas.getContext('2d'))
	return canvas
}

function setCookie(name, val, expires) {
	var date = new Date
	date.setDate(date.getDate() + expires)
	document.cookie = name+"="+val+"; path=/; expires=" + date.toUTCString()
}

function getCookie(name) {
	var matches = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"))
	return matches ? decodeURIComponent(matches[1]) : 0
}

// event handler

document.addEventListener("touchstart", touchHandler, true)
document.addEventListener("touchend", touchHandler, true)
document.addEventListener("touchcancel", touchHandler, true)

function touchHandler(event) {
	event.preventDefault()
	let touches = event.changedTouches,
		first = touches[0],
		type = ""
	switch (event.type) {
		case "touchstart":
			type = "mousedown"
			break
		case "touchend":
			type = "mouseup"
			break
		default:
			return
	}
	let simulatedEvent = document.createEvent("MouseEvent")
	simulatedEvent.initMouseEvent(type, true, true, window, 1, first.screenX, first.screenY, first.clientX, first.clientY, false, false, false, false, 0, null)
	first.target.dispatchEvent(simulatedEvent)
}

document.addEventListener('mousedown', (event) => {
	
	if (event.x > document.documentElement.clientWidth / 2) {
		if (game.player.x < game.width - 1) ++game.player.x
	} else {
		if (game.player.x > 0) --game.player.x
	}
})

document.onmousedown = document.onselectstart = function() {
  return false
}


// ~~~~~~~~~
game.start()