<?php

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Authorization, Content-Type, Cache-Control, X-Requested-With");
header("Access-Control-Allow-Methods: GET, PUT, OPTIONS, HEAD");

// ini_set ('display_errors', 1); ini_set ('display_startup_errors', 1); error_reporting (E_ALL);

require_once("../vendor/autoload.php");

use Dompdf\Dompdf;

function get_request_data () {
  return array_merge(empty($_POST) ? array() : $_POST, (array) json_decode(file_get_contents('php://input'), true), $_GET);
}
function get_method () {
  return $_SERVER['REQUEST_METHOD'];
}
function get_dataurl () {
  return $_SERVER['REQUEST_SCHEME'].'://'.$_SERVER['HTTP_HOST'] . '/data/';
}
function send_response ($response, $code = 200) {
  header("Content-Type: application/json");
  http_response_code($code);
  if (is_array($response)) {
    $response = (object) $response;
  }
  die(json_encode($response));
}

function CollateResponses($user,$context,$kind = "question") {
  $ordered = [];
  // recurse through the filesystem to find all files for matching users
  $db = "./data/{$context}";
  $blocks = array_diff(scandir($db), array('..', '.'));
  $pages = [];
  foreach ($blocks as $index => $block) {
    $file = $db . DIRECTORY_SEPARATOR . $block . DIRECTORY_SEPARATOR . $user . DIRECTORY_SEPARATOR .'db.json';
    if (file_exists($file)) {
      $contents = json_decode(file_get_contents($file));
      switch ($kind) {
        case "question":
          if (isset($contents->question)) $pages[] = (array) $contents;
          break;
        case "note":
          if (isset($contents->note)) $pages[] = (array) $contents;
          break;
      }
    }
  }
  $ordered = [];
  foreach ($pages as $value) {
      $page = $value['page'];
      unset($value['page']);
      $ordered[$page][] = $value;
  }

  return $ordered;
}

class pdfExporter {
  protected $user;
  protected $context;
  protected $template;
  protected $kind;

  function __construct($user, $context, $kind = "question") {
    $this->user = $user;
    $this->context = $context;
    $this->template = file_get_contents('../template.html');
    $this->kind = $kind;
  }

  public function GetCourseName() {
    $notes = CollateResponses($this->user,$this->context);
    foreach ($notes as $page => $notes) {
      return $notes[0]['course'];
    }
  }

  public function Export($filename) {
    $dompdf = new Dompdf();
    $parsedown = new Parsedown();
    $notes = CollateResponses($this->user,$this->context,$this->kind);

    $title = $this->GetCourseName();

    $md = [];
    // $md[] = "# {$title}\n";
    foreach ($notes as $page => $notes) {
      $md[] = "## {$page}\n";
      foreach ($notes as $note) {
        if (!empty($note['question'])) $md[] = "**{$note['question']}**\n";
        if (!empty($note['answer'])) $md[] = $note['answer'] . "\n";
        if (!empty($note['note'])) $md[] = $note['note'] . "\n";
      }
      $md[] = "---\n";
    }
    $md = implode("\n", $md);
    $this->template = str_replace('{{title}}', $title, $this->template);
    $this->template = str_replace('{{notes}}', $parsedown->text($md), $this->template);

    $dompdf->loadHtml($this->template);
    $dompdf->setPaper('A4', 'portrait');
    $dompdf->render();
    file_put_contents("./data/{$filename}.pdf", $dompdf->output());
  }
}

function CleanDownloads() {
  $x = 1 * 60 * 60; // 1 hour
  $current_time = time();
  $db = "./data";
  $files = glob($db . DIRECTORY_SEPARATOR . '*.pdf');
  foreach ($files as $file) {
    if (is_file($file)) {
      if ($current_time - filemtime($file) >= $x) {
        unlink($file);
      }
    }
  }
}

$headers = getallheaders();
$method = get_method();
$data = get_request_data();
$dataurl = get_dataurl();
$salt = 'rise';

if ($method == "OPTIONS") die();

// check the authorization header is valid 
if (!isset($headers['Authorization'])) {
    send_response(array('error' => "I'm a teapot"), 418); // GIGO
}

// quick check to see if the source is recognised
$authhosts = file_get_contents('../authhosts.txt');
$authhosts = explode("\n", $authhosts);
$authhosts = array_map('md5', array_filter(array_map('trim', $authhosts)));
if (!in_array($headers['Authorization'], $authhosts)) {
    send_response(array('error' => 'Unauthorized'), 401);
}

// extract variables from the url (simple routing via htaccess)
$url = $data['url'] ?? null;
list($digest,$context,$block) = explode('/', $url);

$kind = $data['kind'] ?? 'question';

if (empty($digest) || empty($context) || empty($block)) {
  send_response(array('error' => 'Malformed request', 'data' => $data), 400);
}

$db = "./data/{$context}/{$block}/{$digest}";

// $user = base64_decode(strtr($digest, '._-', '+/='));
// PROD - salt the earth to ensure abstraction in case of disk compromise
// $digest = sha1($digest.$salt);
// $context = sha1($context.$salt);

switch ($method) {
  case "DELETE":
    $it = new GlobIterator("./data/{$context}/*/{$digest}/*", FilesystemIterator::KEY_AS_PATHNAME | FilesystemIterator::CURRENT_AS_FILEINFO);
    while($it->valid()){
        $contents = json_decode(file_get_contents($it->current()->getRealPath()));
        if (isset($contents->$kind)) {
          unlink($it->current()->getRealPath());
        }
        $it->next();
    }
    break;

  case "_DELETE":
    $db = "./data/";
    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($db, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($files as $fileinfo) {
        $path = $fileinfo->getPath();
        if (strpos($path, "{$db}{$context}") !== false && (strpos($path, "/{$digest}") !== false)) {
          if (file_exists($fileinfo->getRealPath())) {
            $contents = json_decode(file_get_contents($fileinfo->getRealPath()));
            if (isset($contents->$kind)) {
              unlink($fileinfo->getRealPath());
            }
          }
        }
    }
    CleanDownloads(); // may as well
    send_response(['success' => true]);
  break;

  case "GET":
    switch ($block) {
      case "cleanup":
        CleanDownloads();
      break;

      case "download":
        $pdf = new pdfExporter($digest,$context,$kind);
        $courseName = $pdf->GetCourseName();
        $filename = md5($courseName.time().$salt);
        $pdf->Export($filename);
        $result = new stdClass();
        $result->link = "{$dataurl}{$filename}.pdf";
        $result->filename = $courseName . '.pdf';
        send_response($result);
      break;

      case "collate":
          $results = CollateResponses($key,$course,$kind);
          send_response(['success' => true, 'records' => $results]);
      break;

      default:
        if (!file_exists("{$db}/db.json")) {
          send_response(array('success' => false), 404);
        }
        $data = file_get_contents("{$db}/db.json");
        send_response(json_decode($data));
    }
  break;

  case "PUT":
    if (!file_exists($db)) {
      mkdir($db, 0775, true);
    }
    unset($data['context']);
    unset($data['url']);
    file_put_contents("{$db}/db.json", json_encode($data));
    send_response(array(
      'success' => true,
      // 'value' => $data,
      // 'db' => $db
    ));
  break;

  default:
    send_response(array('error' => 'Bad method'), 405);

}
