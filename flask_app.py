from flask import Flask, render_template, send_from_directory # send_from_directory を追加
import os # osモジュールを追加

# Flaskアプリケーションインスタンスを定義
application = Flask(__name__) # 'application' という変数名を使う

# プロジェクトのルートディレクトリを設定
# この行は、PythonAnywhereのWSGIファイルでは自動的に設定されることが多いですが、
# ローカルでの実行では明確に指定しておくと良いでしょう。
# ここでは、flask_app.py があるディレクトリをルートとしています。
# 必要に応じて、プロジェクトの最上位ディレクトリ（shutinggame）へのパスを設定してください
# 例えば、app = Flask(__name__, root_path=os.path.dirname(os.path.abspath(__file__)))
# のように記述することもできますが、まずはシンプルな構成で。
# application.root_path = os.path.dirname(os.path.abspath(__file__))

# @application.route('/static/<path:filename>') を追加して、staticファイルをサーブ
# Flaskは通常、/static/ を自動的にサーブしますが、明示的に記述することもあります。
# しかし、PythonAnywhereや基本的なFlaskアプリでは必要ないかもしれません。
# もし /static/ が上手く読み込まれない場合にのみ考慮してください。
# @application.route('/static/<path:filename>')
# def static_files(filename):
#     return send_from_directory(application.root_path + '/static', filename)


# ルートURL (/) にアクセスしたときに index.html を表示する
@application.route('/')
def home():
    # templatesフォルダ内の index.html をレンダリング
    return render_template('index.html')

# ローカルで直接実行するための記述
# PythonAnywhereではサーバーがこの部分を自動的に処理するので不要ですが、
# ローカルでの開発・テスト時に便利です。
if __name__ == "__main__":
    # debug=True にすると、開発中にコードを変更した際に自動的にリロードされたり、
    # エラーの詳細が表示されたりします。
    application.run(debug=True)