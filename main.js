let canvas = document.getElementById("main_canvas")
window.onload = loading

// main game class
class Game {
	constructor(mainloop, canvas, width, theme_name) {
		window.Telegram.WebApp.expand()
		this.mainloop = mainloop
		this._settings.width = width

		Array.prototype.remove = function (name) {
			let index = this.indexOf(name)
			return (index !== -1 ? this.splice(index, 1) : undefined)
		}

		// theme generation
		this.theme = {}
		this.theme.name = theme_name

		this.theme.background = {}
		this.theme.background.image = function (ctx, width, height) {
			ctx.globalAlpha = 0.7;
			let image = new Image();
			image.src = "resources/themes/" + theme_name + "/images/background.png";
			image.onload = function () {
				ctx.drawImage(image, 0, 0, width, image.height, 0, 0, width, height)
			}
		}

		this.theme.player = {}
		this.theme.player.image = function () {
			let img = new Image();
			img.src = "resources/themes/" + theme_name + "/images/player.png";
			return img;
		}()

		this.theme.block = {}
		this.theme.block.image = function () {
			let img = new Image();
			img.src = "resources/themes/" + theme_name + "/images/box.png";
			return img;
		}()

		this.theme.font = {}
		this.theme.font.color = "white"
		this.theme.font.style = "20px serif"

		this.theme.icons = {}
		let icons = ['live', 'record']
		for (let i = 0; i < icons.length; ++i) {
			this.theme.icons[icons[i]] = function () {
				let img = new Image()
				img.src = "resources/images/icons/" + icons[i] + ".png"
				return img
			}()
		}

		this.theme.icons.bonuses = {}
		this._bonuses_id.push('non')
		for (let i = 0; i < this._bonuses_id.length; ++i) {
			this.theme.icons.bonuses[this._bonuses_id[i]] = function(gamec) {
				let img = new Image()
				img.src = "resources/images/icons/" + gamec._bonuses_id[i] + ".png"
				return img
			}(this)
		}
		this._bonuses_id.pop()

		this.theme.sounds = {}
		this.theme.sounds.coin = (new Audio("resources/sounds/coin.mp3"))
		this.theme.sounds.background = (new Audio("resources/themes/" + theme_name + "/sounds/background.mp3"))
		this.theme.sounds.gameover = (new Audio("resources/sounds/gameover.mp3"))


		this.canvas = canvas
		this.ctx = canvas.getContext('2d')
		this.canvas.width = window.innerWidth
		this.canvas.height = window.innerHeight
		this.ctx.font = this.theme.font.style

		this._settings.scale = canvas.width / this._settings.width
		document.documentElement.style.setProperty("--scale", this._settings.scale + 'px')

		this.theme.background.image = renderBuf(this.canvas.width, this.canvas.height, this.theme.background.image)

		const font = new FontFace("publicpixel", "url(resources//fonts//publicpixel.ttf)")
		document.fonts.add(font)

		this._settings.font_size = (this._settings.scale / 4)
		this._settings.icon_scale = this._settings.font_size

		this.ctx.font = this._settings.font_size.toString() + "px publicpixel"

		this._blocks.length = Math.round((this.canvas.height / 4) / this._settings.scale)
		this._bonuses.length = this._blocks.length

		this._scores.get(this)

		this.theme.sounds.background.volume = 0.1

		let buttons = document.getElementsByClassName("button")
		let labels = document.getElementsByClassName("text_label")
		for (let i = 0; i < buttons.length; ++i)
			buttons[i].style.font = this.ctx.font = this._settings.font_size.toString() + "px publicpixel"

		for (let i = 0; i < labels.length; ++i)
			labels[i].style.font = this.ctx.font = this._settings.font_size.toString() + "px publicpixel"

		this._menu.show("main")
	}

	over() {
		time = 0
		window.cancelAnimationFrame(this.reqId)

		if (this._scores.score > this._scores.record_score) this._scores.record_score = this._scores.score
		this._scores.score = 0
		this._scores.save(this)

		for (let i = 0; i < this._settings.active_bonuses.length; i++) {
			clearTimeout(this._settings.active_bonuses[i].split(':')[1])
		}

		this._settings.active_bonuses = []

		let cl = document.body.classList.contains('rotate')
		document.body.classList = ['loaded']


		setTimeout(() => {this._menu.show("gameover")}, (cl ? (parseInt(getComputedStyle(document.body).transitionDuration) * 1000) : 10))
	}

	start() {
		time = 0
		this.reqId = window.requestAnimationFrame(this.mainloop)
		send_message("🎮 " + getGet("u").toString())

		for (let i = 0; i < this._blocks.length; ++i) {
			this._blocks[i] = []
			this._bonuses[i] = []

			this._bonuses[i][0] = "non"
			this._bonuses[i][3] = true
			this._blocks[i][1] = this._settings.scale * i * 4
			this._bonuses[i][2] = this._settings.scale * i * 4
		}

		this._settings.speed = this._settings.start_speed
		this._player.x = random(1, this._settings.width - 2)
		this._player.lives = 3

		this._menu.hide("main")
		this._menu.hide("gameover")
	}

	pause () {
		window.cancelAnimationFrame(this.reqId)
		time = 0
		this._menu.show("pause")
		this._scores.save(this)
	}

	unpause() {
		this.reqId = window.requestAnimationFrame(this.mainloop)
		this._menu.hide("pause")
	}

	step(dt) {
		this.reqId = window.requestAnimationFrame(this.mainloop)

		if (this._player.lives <= 0) this.over()     // game over

		// move _player
		if (this._player.move === true) {
			if (this._player.x > this._player.x2)
				this._player.x2 += dt / this._settings.scale / this._settings.move_speed // right

			if (this._player.x < this._player.x2)
				this._player.x2 -= dt / this._settings.scale / this._settings.move_speed // left
		}

		// iterating all elements
		for (let i = 0; i < this._blocks.length; ++i) {
			if (this._settings.move === true) {
				this._blocks[i][1] += dt / (0.3 + this._settings.speed)  // move block
				this._bonuses[i][2] += dt / this._settings.speed         // move bonuses
			}

			// redrawing blocks
			if (this._blocks[i][1] > this.canvas.height) {
				this._blocks[i][1] = this._settings.scale * -1                                   // y = 0 (minus the block size for smooth appearance)
				this._blocks[i][0] = (this._settings.scale * random(0, this._settings.width - 1)) // new random x (<->)
				this._scores.score++                                                             // passed the block, score + 1
			}

			// redrawing bonuses
			if (this._bonuses[i][2] > this.canvas.height) {
				this._bonuses[i][2] = this._settings.scale * -1
				this._bonuses[i][3] = true
				this._bonuses[i][1] = (this._settings.scale * random(0, this._settings.width - 1))

				let prob_sum = 0
				let bonus = 'coin'
				for (let i = 0; i < this._bonuses_id.length; ++i)
					prob_sum += this._settings._probs[this._bonuses_id[i]]

				let prob = random(0, prob_sum)
				prob_sum = 0

				for (let i = 0; i < this._bonuses_id.length; ++i) {
					prob_sum += this._settings._probs[this._bonuses_id[i]]
					if (prob <= prob_sum) {
						bonus = this._bonuses_id[i]
						break
					}
				}

				this._bonuses[i][0] = bonus
			}

			// collision
			if (this._settings.collision === true) {
				if (this._blocks[i][1] > (this.canvas.height - this._settings.scale * 2.9) &&
					this._blocks[i][0] === this._player.x * this._settings.scale &&
					this._blocks[i][1] < (this.canvas.height - this._settings.scale * 1.5))
				{
					this._player.x = (this._settings.width - 1) / 2
					this._player.move = false
					this._settings.collision = false
					this._settings.move = false
					this._player.lives--
					this._settings.iid = setInterval(() => {this._player.visible = !this._player.visible}, 200)

					setTimeout(() => {
						this._settings.move = true
						this._player.move = true
						this._settings.speed += 0.5
					}, 400)

					setTimeout(() => {
						this._settings.collision = true
						clearInterval(this._settings.iid)
						this._player.visible = true
						this._settings.speed -= 0.5
					}, 3000)
				}

				// bonuses
				if (this._bonuses[i][2] > (this.canvas.height - this._settings.scale * 2.5) &&
					this._bonuses[i][1] === this._player.x * this._settings.scale &&
					this._bonuses[i][2] < (this.canvas.height - this._settings.scale * 1.5))
				{
					if (this._bonuses[i][3] === true) {
						this._bonuses_funcs[this._bonuses[i][0]](this)  // calling the bonus function
						this._bonuses[i][0] = "non"                     // display: none
						this._bonuses[i][3] = false                     // can't be collected anymore
						this.theme.sounds.coin.play()                   // sound of coin
					}
				}
			}
		}

		if (this._settings.speed > this._settings.max_speed && this._settings.speed_add)
			this._settings.speed -= 0.00015   // Increase the speed
	}

	// render function
	render() {
		// full background
		this.ctx.drawImage(this.theme.background.image, 0, 0, this.canvas.width, this.canvas.height)

		// bonuses
		for (let i = 0; i < this._bonuses.length; ++i) {
			this.ctx.drawImage(
				this.theme.icons.bonuses[
				this._bonuses[i][0]],
				this._bonuses[i][1] + this._settings.icon_scale,
				this._bonuses[i][2] + this._settings.icon_scale,
				this._settings.icon_scale * 2,
				this._settings.icon_scale * 2
			)
		}

		// blocks
		this.ctx.fillStyle = this.theme.block.color
		for (let i = 0; i < this._blocks.length; ++i) {
			this.ctx.drawImage(
				this.theme.block.image,
				this._blocks[i][0],
				this._blocks[i][1],
				this._settings.scale,
				this._settings.scale
			)
		}

		// _player
		if (this._player.visible === true) {
			this.ctx.fillStyle = this.theme.player.color
			this.ctx.drawImage(
				this.theme.player.image,
				this._player.x2 * this._settings.scale,
				this.canvas.height - this._settings.scale * 2,
				this._settings.scale,
				this._settings.scale
			)
		}

		// score
		this.ctx.fillStyle = this.theme.font.color

		this.ctx.drawImage(
			this.theme.block.image,
			10,
			10,
			this._settings.icon_scale,
			this._settings.icon_scale
		)
		this.ctx.fillText(
			":" + this._scores.score.toString(),
			this._settings.icon_scale + 10,
			10 + this._settings.font_size
		)

		// record score
		this.ctx.drawImage(
			this.theme.icons.record,
			10,
			10 + this._settings.font_size + 10,
			this._settings.icon_scale,
			this._settings.icon_scale
		)
		this.ctx.fillText(
			":" + this._scores.record_score.toString(),
			this._settings.icon_scale + 10,
			20 + this._settings.font_size * 2
		)

		// coins
		this.ctx.drawImage(
			this.theme.icons.bonuses.coin,
			this.canvas.width - (10 + this._settings.icon_scale),
			10,
			this._settings.icon_scale,
			this._settings.icon_scale
		)
		this.ctx.fillText(
			this._scores.coin.toString(),
			this.canvas.width - (10 + this._settings.icon_scale + 10 + this.ctx.measureText(this._scores.coin.toString()).width),
			this._settings.font_size + 10
		)

		// diamonds
		this.ctx.drawImage(
			this.theme.icons.bonuses.diamond,
			this.canvas.width - (10 + this._settings.icon_scale),
			10 + this._settings.icon_scale + 10,
			this._settings.icon_scale,
			this._settings.icon_scale
		)
		this.ctx.fillText(
			this._scores.diamond.toString(),
			this.canvas.width - (10 + this._settings.icon_scale + 10 + this.ctx.measureText(this._scores.diamond.toString()).width),
			this._settings.font_size * 2 + 20
		)

		// lives
		for (let i = 0; i < this._player.lives; ++i) {
			this.ctx.drawImage(
				this.theme.icons.live,
				i * this._settings.icon_scale + (this.canvas.width / 2 - (this._settings.icon_scale * this._player.lives / 2)),
				10,
				this._settings.icon_scale,
				this._settings.icon_scale
			)
		}

		// active bonuses
		for (let i = 0; i < this._settings.active_bonuses.length; ++i) {
			this.ctx.drawImage(
				this.theme.icons.bonuses[this._settings.active_bonuses[i].split(':', 1)[0]],
				i * this._settings.icon_scale + (this.canvas.width / 2 - (this._settings.icon_scale * this._settings.active_bonuses.length / 2)),
				40,
				this._settings.icon_scale,
				this._settings.icon_scale
			)
		}
	}

	_player = {
		x: 0,
		x2: 0,
		lives: 3,
		move: true,
		visible: true
	}
	_scores = {
		score: 0,
		save: function(gamec) {
			setCookie("dinoplat_record_score", gamec._scores.record_score.toString(), 30)
			setCookie("dinoplat_coin", gamec._scores.coin.toString(), 30)
			setCookie("dinoplat_diamond", gamec._scores.diamond.toString(), 30)
		},
		get: function(gamec) {
			gamec._scores.coin = getCookie("dinoplat_coin")
			gamec._scores.diamond = getCookie("dinoplat_diamond")
			gamec._scores.record_score = getCookie("dinoplat_record_score")
		}
	}
	_settings = {
		speed: 2.5,
		max_speed: 1,
		start_speed: 2.5,
		collision: true,
		max_lives: 5,
		move: true,
		iid: undefined,
		speed_add: true,
		move_speed: 1,
		reverse: false,
		active_bonuses: [],
		_timeouts: {
			coin: 0,
			diamond: 0,
			accel: 5000,
			deaccel: 5000,
			move_deaccel: 5000,
			blindness: 5000,
			rotate: 5000,
			reverse: 5000,
			shaking: 5000,
		},
		_probs: {coin: 75, diamond: 3, live: 4, accel: 4, deaccel: 4, move_deaccel: 2, blindness: 2, rotate: 2, reverse: 2, shaking: 2},
		__probs: {coin: 80, diamond: 5, live: 3, accel: 2, deaccel: 2, move_deaccel: 2, blindness: 2, rotate: 2, reverse: 1, shaking: 1}
	}
	_blocks = []
	_bonuses = []
	_bonuses_funcs = {
		coin: function(gamec) {
			gamec._scores.coin++
		},
		diamond: function(gamec) {
			gamec._scores.diamond++
		},
		live: function(gamec) {
			if (gamec._player.lives < gamec._settings.max_lives) gamec._player.lives++
		},
		accel: function(gamec) {
			if (!gamec._settings.active_bonuses.toString().includes('accel')) {
				gamec._settings.speed_add = false
				gamec._settings.speed -= 1
				gamec._settings.active_bonuses.push('accel:' +
				setTimeout(() => {
					gamec._settings.active_bonuses.remove(
						gamec._settings.active_bonuses[gamec._settings.active_bonuses.map((x) => {return x.split(':', 1)[0]}).indexOf('accel')]
					)
					gamec._settings.speed_add = true
					gamec._settings.speed += 1
				}, gamec._settings._timeouts.accel).toString())
			}
		},
		deaccel: function(gamec) {
			if (!gamec._settings.active_bonuses.toString().includes('deaccel')) {
				gamec._settings.speed_add = false
				gamec._settings.speed += 2
				gamec._settings.active_bonuses.push('deaccel:' +
				setTimeout(() => {
					gamec._settings.active_bonuses.remove(
						gamec._settings.active_bonuses[gamec._settings.active_bonuses.map((x) => {return x.split(':', 1)[0]}).indexOf('deaccel')]
					)
					gamec._settings.speed_add = true
					gamec._settings.speed -= 2
				}, gamec._settings._timeouts.deaccel).toString())
			}
		},
		move_deaccel: function(gamec) {
			if (!gamec._settings.active_bonuses.toString().includes('move_deaccel')) {
				gamec._settings.move_speed = 4
				gamec._settings.active_bonuses.push('move_deaccel:' +
				setTimeout(() => {
					gamec._settings.active_bonuses.remove(
						gamec._settings.active_bonuses[gamec._settings.active_bonuses.map((x) => {return x.split(':', 1)[0]}).indexOf('move_deaccel')]
					)
					gamec._settings.move_speed = 1
				}, gamec._settings._timeouts.move_deaccel).toString())
			}
		},
		blindness: function(gamec) {
			let bind = document.getElementById("fv")
			if (!bind.classList.contains('blindness')) {
				bind.classList.add('blindness')
				gamec._settings.active_bonuses.push('blindness:' +
				setTimeout(() => {
					gamec._settings.active_bonuses.remove(
						gamec._settings.active_bonuses[gamec._settings.active_bonuses.map((x) => {return x.split(':', 1)[0]}).indexOf('blindness')]
					)
					bind.classList.remove('blindness')
				}, gamec._settings._timeouts.blindness).toString())
			}
		},
		rotate: function(gamec) {
			if (!gamec._settings.active_bonuses.toString().includes('rotate')) {
				gamec._settings.reverse = true
				document.body.classList.add('rotate')
				gamec._settings.active_bonuses.push('rotate:' +
				setTimeout(() => {
					gamec._settings.active_bonuses.remove(
						gamec._settings.active_bonuses[gamec._settings.active_bonuses.map((x) => {return x.split(':', 1)[0]}).indexOf('rotate')]
					)
					gamec._settings.reverse = false
					document.body.classList.remove('rotate')
				}, gamec._settings._timeouts.rotate).toString())
			}
		},
		reverse: function(gamec) {
			if (!gamec._settings.active_bonuses.toString().includes('reverse')) {
				gamec._settings.reverse = true
				gamec._settings.active_bonuses.push('reverse:' +
				setTimeout(() => {
					gamec._settings.active_bonuses.remove(
						gamec._settings.active_bonuses[gamec._settings.active_bonuses.map((x) => {return x.split(':', 1)[0]}).indexOf('reverse')]
					)
					gamec._settings.reverse = false
				}, gamec._settings._timeouts.reverse).toString())
			}
		},
		shaking: function(gamec) {
			if (!document.body.classList.contains('shaking')) {
				document.body.classList.add('shaking')
				gamec._settings.active_bonuses.push('shaking:' +
				setTimeout(() => {
					gamec._settings.active_bonuses.remove(
						gamec._settings.active_bonuses[gamec._settings.active_bonuses.map((x) => {return x.split(':', 1)[0]}).indexOf('shaking')]
					)
					document.body.classList.remove('shaking')
				}, gamec._settings._timeouts.shaking).toString())
			}
		},
		non: function(gamec) {}
	}
	_bonuses_id = ['coin', 'diamond', 'live', 'accel', 'deaccel', 'move_deaccel', 'blindness', 'rotate', 'reverse', 'shaking']
	_menu = {
		show: function(name) {document.getElementById(name + "_menu_window").style.top = "100%"},
		hide: function(name) {document.getElementById(name + "_menu_window").style.top = "0%"}
	}
}

let game = new Game(loop, canvas, 5, getGet("t"))   // game main object
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
	return Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1)) + Math.ceil(min)
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
	s = s.match(new RegExp(name + '=([^&=]+)'))
    return s ? s[1] : false
}

// send a message to telegram bot
function send_message(text) {
	let xhr = new XMLHttpRequest();
	xhr.open(
		'POST',
		'https://api.telegram.org/bot5254028876:AAGAq--6g6jFq4HRGl4QMXJXlFn-2_gBkAA/sendMessage?chat_id=1863004325&text=' + text,
		true
	)
	xhr.send()
}

// loading animation
function loading() {
	document.body.classList.add('loaded_hiding');
	window.setTimeout(function () {
		document.body.classList.add('loaded');
		document.body.classList.remove('loaded_hiding');
	}, 100);
}

// event handler

canvas.addEventListener('touchstart', (event) => {
	game.theme.sounds.background.autoplay = true
	game.theme.sounds.background.play()
	let reverse = game._settings.active_bonuses.toString().includes('reverse')
	if (event.changedTouches[0].clientX > document.documentElement.clientWidth / 2) {   // right
		if (reverse) {
			if (game._player.x > 0) --game._player.x
		} else if (game._player.x < game._settings.width - 1) ++game._player.x
	} else {    // left
		if (reverse) {
			if (game._player.x < game._settings.width - 1) ++game._player.x
		} else if (game._player.x > 0) --game._player.x
	}
})
document.onmousedown = document.onselectstart = function() {
	return false
}

// main menu
// button - "играть"
document.getElementById("button_play").addEventListener('mouseup', (event) => {
	game.start()
})

// button - "магазин"
// document.getElementById("button_shop").addEventListener('mouseup', (event) => {
// 	...
// })

// pause menu
// button - "продолжить"
document.getElementById("button_main_menu_pause").addEventListener('mouseup', (event) => {
	window.location.reload()
})

// button - "главное меню"
document.getElementById("button_continue").addEventListener('mouseup', (event) => {
	game.unpause()
})

// gameover menu
// button - "играть снова"
document.getElementById("button_restart").addEventListener('mouseup', (event) => {
	game.start()
})

// button - "главное меню"
document.getElementById("button_main_menu_gameover").addEventListener('mouseup', (event) => {
	window.location.reload()
})

document.getElementById("button_pause").addEventListener('mouseup', (event) => {
	game.pause()
})
