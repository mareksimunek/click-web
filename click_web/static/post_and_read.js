let REQUEST_RUNNING = false;
function postAndRead() {
    if (REQUEST_RUNNING) {
        return false;
    }

    let submit_btn = document.getElementById("submit_btn");
    submit_btn.disabled = true;

    input_form = document.getElementById("inputform");
    if (!input_form.reportValidity()) {
        // not valid form values, abort.
        return false;
    }

    try {
        TextDecoder
    } catch (e) {
        console.error(e);
        // Browser missing Text decoder (Edge?)
        // post form the normal way.
        return true;

    }

    try {
        REQUEST_RUNNING = true;
        let runner = new ExecuteAndProcessOutput(input_form);
        runner.run();
    } catch (e) {
        console.error(e);

    } finally {
        // if we executed anything never post form
        // as we do not know if form already was submitted.
        return false;

    }
}

class ExecuteAndProcessOutput {
    constructor(form) {
        this.form = form;
        this.decoder = new TextDecoder();
        this.output_header_div = document.getElementById("output-header")
        this.output_div = document.getElementById("output")
        this.output_footer_div = document.getElementById("output-footer")
        // clear old content
        this.output_header_div.innerHTML = '';
        this.output_div.innerHTML = '';
        this.output_footer_div.innerHTML = '';
        // show script output
        this.output_header_div.hidden = false;
        this.output_div.hidden = false;
        this.output_footer_div.hidden = false;
    }

    run() {
        let submit_btn = document.getElementById("submit_btn");

        this.post()
            .then(response => {
                this.form.disabled = true;
                if (response.body === undefined) {
                    console.log('body streams are experimental in FireFox and not enabled by default!');
                    console.log('It is supported in FF by setting "javascript.options.streams" to true in "about:config"');
                    console.log('See: https://developer.mozilla.org/en-US/docs/Web/API/Body/body');
                    console.warn('Falling back to reading full response.');
                    response.text()
                        .then(text => this.output_div.innerHTML = text);

                    submit_btn.disabled = false;

                    return;

                }
                let reader = response.body.getReader();

                return this.processStreamReader(reader);
            })
            .then(_ => {
                REQUEST_RUNNING = false
                submit_btn.disabled = false;
            })
            .catch(error => {
                console.error(error);
                REQUEST_RUNNING = false;
                submit_btn.disabled = false;
        }
    );

    }

    post() {
        console.log("Posting to " + command_url);
        return fetch(command_url, {
            method: "POST",
            body: new FormData(this.form),
            // for fetch streaming only accept plain text, we wont handle html
            headers: {Accept: 'text/plain'}
        });
    }

    async processStreamReader(reader) {
        while (true) {
            const result = await reader.read();
            let chunk = this.decoder.decode(result.value);
            console.log(chunk);
            let insert_func = this.output_div.insertAdjacentText;
            let elem = this.output_div;

            // Split the read chunk into sections if needed.
            // Below implementation is not perfect as it expects the CLICK_WEB section markers to be
            // complete and not in separate chunks. However it seems to work fine
            // as long as the generating server yields the CLICK_WEB section in one string as they should be
            // quite small.
            if (chunk.includes('<!-- CLICK_WEB')) {
                // there are one or more click web special sections, use regexp split chunk into parts
                // and process them individually
                let parts = chunk.split(/(<!-- CLICK_WEB [A-Z]+ [A-Z]+ -->)/);
                for (let part of parts) {
                    [elem, insert_func] = this.getInsertFunc(part, elem, insert_func);
                    if (part.startsWith('<!-- ')) {
                        // no not display end section comments.
                        continue;
                    } else {
                        insert_func.call(elem, 'beforeend', part);
                    }
                }
            } else {
                insert_func.call(elem, 'beforeend', chunk);
            }

            if (result.done) {
                break
            }
        }
    }

    getInsertFunc(part, current_elem, current_func) {
        // If we enter new section modify output method accordingly.
        if (part.includes(' START ')) {
            if (part.includes(' HEADER ')) {
                return [this.output_header_div, this.output_header_div.insertAdjacentHTML];
            } else if (part.includes(' FOOTER ')) {
                return [this.output_footer_div, this.output_footer_div.insertAdjacentHTML];
            } else {
                throw new Error("Unknown part:" + part);
            }
        } else if (part.includes(' END ')) {
            // plain text again
            return [this.output_div, this.output_div.insertAdjacentText];
        } else {
            // no change
            return [current_elem, current_func];
        }
    }
}
