let canvas = document.getElementById("main_canvas")
window.Telegram.WebApp.expand()

// main game class
class Game {
	constructor(mainloop, canvas, width, theme_name) {
		this.mainloop = mainloop
		this.settings.width = width

		// theme generation
		this.theme = {}

		this.theme.name = theme_name
		this.theme.background = {}
		this.theme.background.image = function(ctx, width, height) {ctx.globalAlpha = 0.7; let image = new Image(); image.src = "resources/themes/" + theme_name + "/images/background.png"; image.onload = function() {ctx.drawImage(image, 0, 0, width, image.height, 0, 0, width, height)}}

		this.theme.player = {}
		this.theme.player.image = function () {let img = new Image(); img.src = "resources/themes/" + theme_name + "/images/player.png"; return img;}()

		this.theme.block = {}
		this.theme.block.image = function () {let img = new Image(); img.src = "resources/themes/" + theme_name + "/images/box.png"; return img;}()

		this.theme.font = {}
		this.theme.font.color = "white"
		this.theme.font.style = "20px serif"

		this.theme.icons = {}
		this.theme.icons.bonuses = {}
		this.theme.icons.bonuses.coin = function () {let img = new Image(); img.src = "resources/images/icons/coin.png"; return img;}()
		this.theme.icons.bonuses.diamond = function () {let img = new Image(); img.src = "resources/images/icons/diamond.png"; return img;}()
		this.theme.icons.bonuses.live = function () {let img = new Image(); img.src = "resources/images/icons/live.png"; return img;}()
		this.theme.icons.bonuses.non = function () {let img = new Image(); img.src = "resources/images/icons/non.png"; return img;}()
		this.theme.icons.live = function () {let img = new Image(); img.src = "resources/images/icons/live.png"; return img;}()
		this.theme.icons.record = function () {let img = new Image(); img.src = "resources/images/icons/record.png"; return img;}()
		this.theme.icons.score = function () {let img = new Image(); img.src = "resources/themes/" + theme_name + "/images/box.png"; return img;}()

		this.theme.sounds = {}
		this.theme.sounds.coin = (new Audio("resources/sounds/coin.mp3"))
		this.theme.sounds.background = (new Audio("resources/themes/" + theme_name + "/sounds/background.mp3"))
		this.theme.sounds.gameover = (new Audio("resources/sounds/gameover.mp3"))


		this.canvas = canvas
		this.ctx = canvas.getContext('2d')
		this.canvas.width = window.innerWidth
		this.canvas.height = window.innerHeight
		this.ctx.font = this.theme.font.style

		this.settings.scale = canvas.width / this.settings.width

		this.theme.background.image = renderBuf(this.canvas.width, this.canvas.height, this.theme.background.image)

		const font = new FontFace("publicpixel", "url(resources//fonts//publicpixel.ttf)")
		document.fonts.add(font)

		this.settings.font_size = (this.settings.scale / 4)
		this.settings.icon_scale = this.settings.font_size

		this.ctx.font = this.settings.font_size.toString() + "px publicpixel"
		document.getElementById("game_over_text").style.font = (this.settings.font_size * 1.5).toString() + "px publicpixel"

		this._blocks.length = Math.round((this.canvas.height / 4) / this.settings.scale)
		this._bonuses.length = this._blocks.length

		this.scores.coin = getCookie("dinoplat_coin")
		this.scores.diamond = getCookie("dinoplat_diamond")
		this.scores.record_score = getCookie("dinoplat_record_score")

		this.theme.sounds.background.volume = 0.1


		let buttons = document.getElementsByClassName("button")

		for (let i = 0; i < buttons.length; ++i) {
			buttons[i].style.font = this.ctx.font = this.settings.font_size.toString() + "px publicpixel"
		}

		document.getElementById("game_over_background").style.width = this.canvas.width.toString() + 'px'
		document.getElementById("game_over_background").style.height = this.canvas.height.toString() + 'px'

		document.getElementById("game_over_window").style.left = (this.canvas.width / 5 - this.ctx.measureText(document.getElementById("game_over_text").textContent).width / 2).toString() + 'px'
	}

	over() {
		time = 0
		window.cancelAnimationFrame(this.reqId)

		if (this.scores.score > this.scores.record_score) this.scores.record_score = this.scores.score
		this.scores.score = 0

		setCookie("dinoplat_record_score", this.scores.record_score.toString(), 30)
		setCookie("dinoplat_coin", this.scores.coin.toString(), 30)
		setCookie("dinoplat_diamond", this.scores.diamond.toString(), 30)

		document.getElementById("game_over_background").style.top = "0px"
		document.getElementById("game_over_background").style.backgroundColor = "rgba(0, 0, 0, 0.7)"

		document.getElementById("game_over_window").style.top = (this.canvas.height / 3).toString() + 'px'

		// game.start()
	}

	start() {
		time = 0
		this.reqId = window.requestAnimationFrame(this.mainloop)

		for (let i = 0; i < this._blocks.length; ++i) {
			this._blocks[i] = []
			this._bonuses[i] = []

			this._bonuses[i][0] = "non"
			this._bonuses[i][3] = true
			this._blocks[i][1] = this.settings.scale * i * 4
			this._bonuses[i][2] = this.settings.scale * i * 4
		}

		this.settings.speed = this.settings.start_speed
		this.player.x = random(1, this.settings.width - 2)
		this.player.lives = 3

		document.getElementById("game_over_background").style.top = (this.canvas.height * -1).toString() + 'px'
		document.getElementById("game_over_window").style.top = (this.canvas.height * -1).toString() + 'px'
		document.getElementById("game_over_background").style.backgroundColor = "rgba(0, 0, 0, 0.0)"
	}

	step(dt) {
		this.reqId = window.requestAnimationFrame(this.mainloop)

		if (this.player.lives <= 0) this.over()     // game over

		// move player
		if (this.player.move === true) {
			if (this.player.x > this.player.x2) this.player.x2 += 0.25  // right
			if (this.player.x < this.player.x2) this.player.x2 -= 0.25  // left
		}

		// probs control
		if (this.player.lives === this.settings.max_lives) this._probs.live = 0
		else if (this.player.lives <= 2) { this._probs.live = 5; this._probs.diamond = 10}
		else if (this.player.lives === Math.ceil(this.settings.max_lives / 2)) this._probs.live = 3

		// iterating all elements
		for (let i = 0; i < this._blocks.length; ++i) {
			if (this.settings.move === true) {
				this._blocks[i][1] += dt / (0.3 + this.settings.speed)  // move block
				this._bonuses[i][2] += dt / this.settings.speed         // move bonuses
			}

			// redrawing blocks
			if (this._blocks[i][1] > this.canvas.height) {
				this._blocks[i][1] = this.settings.scale * -1                                   // y = 0 (minus the block size for smooth appearance)
				this._blocks[i][0] = (this.settings.scale * random(0, this.settings.width - 1)) // new random x (<->)
				this.scores.score++                                                             // passed the block, score + 1
			}

			// redrawing bonuses
			if (this._bonuses[i][2] > this.canvas.height) {
				this._bonuses[i][2] = this.settings.scale * -1
				this._bonuses[i][3] = true
				this._bonuses[i][1] = (this.settings.scale * random(0, this.settings.width - 1))
				let prob = random(0, 100)
				this._bonuses[i][0] = this._bonuses_id[(prob <= this._probs.coin ? this._bonuses_id.indexOf("coin") : (prob <= this._probs.diamond + this._probs.coin ? this._bonuses_id.indexOf("diamond") : (prob <= this._probs.diamond + this._probs.coin + this._probs.live ? this._bonuses_id.indexOf("live") : (0))))]
			}

			// collision
			if (this.settings.collision === true) {
				if (this._blocks[i][1] > (this.canvas.height - this.settings.scale * 2.9) && this._blocks[i][0] === this.player.x * this.settings.scale && this._blocks[i][1] < (this.canvas.height - this.settings.scale * 1.5)) {
					this.player.x = (this.settings.width - 1) / 2
					this.player.move = false
					this.settings.collision = false
					this.settings.move = false
					this.player.lives--
					this.settings.iid = setInterval(() => {this.player.visible = !this.player.visible}, 200)

					setTimeout(() => {
						this.settings.move = true
						this.player.move = true
						this.settings.speed = this.settings.start_speed
					}, 300)

					setTimeout(() => {this.settings.collision = true; clearInterval(this.settings.iid); this.player.visible = true}, 3000)
				}

				// bonuses
				if (this._bonuses[i][2] > (this.canvas.height - this.settings.scale * 2.5) && this._bonuses[i][1] === this.player.x * this.settings.scale && this._bonuses[i][2] < (this.canvas.height - this.settings.scale * 1.5)) {
					if (this._bonuses[i][3] === true) {
						this._bonuses_funcs[this._bonuses[i][0]](this)  // calling the bonus function
						this._bonuses[i][0] = "non"                     // display: none
						this._bonuses[i][3] = false                     // can't be collected anymore
						this.theme.sounds.coin.play()                   // sound of coin
					}
				}
			}
		}

		if (this.settings.speed > this.settings.max_speed) this.settings.speed -= 0.00005    // Increase the speed
	}

	// render function
	render() {
		// full background
		this.ctx.drawImage(this.theme.background.image, 0, 0, this.canvas.width, this.canvas.height)

		// bonuses
		for (let i = 0; i < this._bonuses.length; ++i) {
			this.ctx.drawImage(this.theme.icons.bonuses[this._bonuses[i][0]], this._bonuses[i][1] + this.settings.icon_scale, this._bonuses[i][2] + this.settings.icon_scale, this.settings.icon_scale * 2, this.settings.icon_scale * 2)
		}

		// blocks
		this.ctx.fillStyle = this.theme.block.color
		for (let i = 0; i < this._blocks.length; ++i) {
			this.ctx.drawImage(this.theme.block.image, this._blocks[i][0], this._blocks[i][1], this.settings.scale, this.settings.scale)
		}

		// player
		if (this.player.visible === true) {
			this.ctx.fillStyle = this.theme.player.color
			this.ctx.drawImage(this.theme.player.image, (this.player.x2 * this.settings.scale), (this.canvas.height - this.settings.scale * 2), this.settings.scale, this.settings.scale)
		}

		// score
		this.ctx.fillStyle = this.theme.font.color
		
		this.ctx.drawImage(this.theme.icons.score, 10, 10, this.settings.icon_scale, this.settings.icon_scale)
		this.ctx.fillText(":" + this.scores.score.toString(), this.settings.icon_scale + 10, 10 + this.settings.font_size)

		// record score
		this.ctx.drawImage(this.theme.icons.record, 10, 10 + this.settings.font_size + 10, this.settings.icon_scale, this.settings.icon_scale)
		this.ctx.fillText(":" + this.scores.record_score.toString(), this.settings.icon_scale + 10, 20 + this.settings.font_size * 2)

		// coins
		this.ctx.drawImage(this.theme.icons.bonuses.coin, this.canvas.width - (10 + this.settings.icon_scale), 10, this.settings.icon_scale, this.settings.icon_scale)
		this.ctx.fillText(this.scores.coin.toString(), this.canvas.width - (10 + this.settings.icon_scale + 10 + this.ctx.measureText(this.scores.coin.toString()).width), this.settings.font_size + 10)

		// diamonds
		this.ctx.drawImage(this.theme.icons.bonuses.diamond, this.canvas.width - (10 + this.settings.icon_scale), 10 + this.settings.icon_scale + 10, this.settings.icon_scale, this.settings.icon_scale)
		this.ctx.fillText(this.scores.diamond.toString(), this.canvas.width - (10 + this.settings.icon_scale + 10 + this.ctx.measureText(this.scores.diamond.toString()).width), this.settings.font_size * 2 + 20)

		// lives
		for (let i = 0; i < this.player.lives; ++i) {
			this.ctx.drawImage(this.theme.icons.live, i * this.settings.icon_scale + (this.canvas.width / 2 - (this.settings.icon_scale * this.player.lives / 2)), 10, this.settings.icon_scale, this.settings.icon_scale)
		}
	}

	player = {x: 0, x2: 0, lives: 3, move: true, visible: true}
	scores = {score: 0, record_score: 0, coin: 0, diamond: 0}
	settings = {speed: 2.5, max_speed: 1, start_speed: 2.5, collision: true, max_lives: 5, move: true, iid: undefined}

	// system
	_blocks = []

	_probs = {diamond: 5, coin: 80, live: 3}
	_bonuses = []
	_bonuses_funcs = {
		coin: function(gamec) {gamec.scores.coin++},
		diamond: function(gamec) {gamec.scores.diamond++},
		live: function(gamec) {if (gamec.player.lives < gamec.settings.max_lives) {gamec.player.lives++}}
	}
	_bonuses_id = ["coin", "diamond", "live"]
}

let game = new Game(loop, canvas, 5, getGet("theme"))   // game main object
let time

// main loop
function loop() {
	let now = new Date().getTime(),
		dt = now - (time || now)

	time = now

	game.step(dt)   // game step
	game.render()   // render changes
}

// system functions

// a whole random number from min to max inclusive
function random(min, max) {
	min = Math.ceil(min)
	max = Math.floor(max)
	return Math.floor(Math.random() * (max - min + 1)) + min
}

// canvas to image
function renderBuf(width, height, render) {
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	render(canvas.getContext('2d'), width, height)
	return canvas
}

// write cookie
function setCookie(name, val, expires) {
	let date = new Date
	date.setDate(date.getDate() + expires)
	document.cookie = name+"="+val+"; path=/; expires=" + date.toUTCString()
}

// get cookie
function getCookie(name) {
	let matches = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([\.$?*|{}()\[\]\\\/+^])/g, '\\$1')}=([^;]*)`))
	return matches ? decodeURIComponent(matches[1]) : 0
}

// get parameters transmitted to the page
function getGet(name) {
	let s = window.location.search
	s = s.match(new RegExp(name + '=([^&=]+)'));
    return s ? s[1] : false;
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

canvas.addEventListener('mousedown', (event) => {
	game.theme.sounds.background.autoplay = true
	game.theme.sounds.background.play()
	if (event.x > document.documentElement.clientWidth / 2) {
		if (game.player.x < game.settings.width - 1) ++game.player.x
	} else {
		if (game.player.x > 0) --game.player.x
	}
})
document.onmousedown = document.onselectstart = function() {
	return false
}

document.getElementById("restart").addEventListener('mouseup', (event) => {
	game.start()
})

game.start()
