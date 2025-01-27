import tempfile
from pathlib import Path

import click
import jinja2
from flask import Blueprint, Flask

import click_web.resources.cmd_exec
import click_web.resources.cmd_form
import click_web.resources.index

jinja_env = jinja2.Environment(extensions=['jinja2.ext.do'])

'The full path to the click script file to execute.'
script_file = None
'The click root command to serve'
click_root_cmd = None


def _get_output_folder():
    _output_folder = (Path(tempfile.gettempdir()) / 'click-web')
    if not _output_folder.exists():
        _output_folder.mkdir()
    return _output_folder


'Where to place result files for download'
OUTPUT_FOLDER = str(_get_output_folder())

_flask_app = None
logger = None


def create_click_web_app(module, command: click.BaseCommand):
    '''
    Create a Flask app that wraps a click command. (Call once)

    :param module: the module that contains the click command, needed to get the path to the script.
    :param command: The actual click root command, needed to be able to read the command tree and arguments
                    in order to generate the index page and the html forms
    usage:

        from click_web import create_click_web_app

        import a_click_script

        app = create_click_web_app(a_click_script, a_click_script.a_group_or_command)

    '''
    global _flask_app, logger
    assert _flask_app is None, "Flask App already created."

    _register(module, command)

    _flask_app = Flask(__name__)

    # add the "do" extension needed by our jinja templates
    _flask_app.jinja_env.add_extension('jinja2.ext.do')

    _flask_app.add_url_rule('/', 'index', click_web.resources.index.index)
    _flask_app.add_url_rule('/<path:command_path>', 'command', click_web.resources.cmd_form.get_form_for)
    executor = click_web.resources.cmd_exec.Executor()
    _flask_app.add_url_rule('/<path:command_path>', 'command_execute', executor.exec,
                            methods=['POST'])

    _flask_app.logger.info(f'OUTPUT_FOLDER: {OUTPUT_FOLDER}')
    results_blueprint = Blueprint('results', __name__, static_url_path='/static/results', static_folder=OUTPUT_FOLDER)
    _flask_app.register_blueprint(results_blueprint)

    logger = _flask_app.logger

    return _flask_app


def _register(module, command: click.BaseCommand):
    '''

    :param module: the module that contains the command, needed to get the path to the script.
    :param command: The actual click root command, needed to be able to read the command tree and arguments
                    in order to generate the index page and the html forms
    '''
    global click_root_cmd, script_file
    script_file = str(Path(module.__file__).absolute())
    click_root_cmd = command
